import crypto from 'node:crypto';

export const ROLES = {
  admin: { name: '管理员', level: 3 },
  operator: { name: '运维人员', level: 2 },
  viewer: { name: '只读用户', level: 1 },
};

const err = (status, message) => Object.assign(new Error(message), { status });
const SCRYPT = { N: 16384, r: 8, p: 1 };

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, 32, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(pw, stored) {
  const [alg, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expect = Buffer.from(hash, 'base64');
  const got = crypto.scryptSync(String(pw), Buffer.from(salt, 'base64'), expect.length, SCRYPT);
  return crypto.timingSafeEqual(got, expect);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** 密码规则：至少 8 位，包含字母和数字 */
export function checkPasswordStrength(pw) {
  const s = String(pw ?? '');
  if (s.length < 8) return '密码至少 8 位';
  if (s.length > 64) return '密码最多 64 位';
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return '密码需同时包含字母和数字';
  return null;
}

const clip = (v, n = 100) => (v == null || v === '' ? null : String(v).trim().slice(0, n) || null);

/**
 * 用户、会话、项目。
 * 访问范围（scope）：{ all: true } 表示全部项目；否则 { all: false, projects: ['项目名', ...] }。
 */
export class AuthService {
  constructor(db, config, logger) {
    this.db = db;
    this.config = config;
    this.logger = logger;
    this.failures = new Map(); // key -> { count, until }
    this.bootstrap();
  }

  /** 没有可用的管理员时创建初始管理员 admin，首次登录必须修改密码 */
  bootstrap() {
    const admins = this.db.prepare("SELECT count(*) c FROM users WHERE role = 'admin' AND enabled = 1").get().c;
    if (admins > 0) return;
    const pw = this.config.adminPassword || 'admin123';
    const existing = this.db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
    if (existing) {
      // 用户名 admin 已存在但不是可用管理员：恢复为管理员并重置初始密码
      this.db.prepare("UPDATE users SET role = 'admin', all_projects = 1, enabled = 1, password_hash = ?, must_change = 1 WHERE id = ?").run(hashPassword(pw), existing.id);
    } else {
      this.db.prepare("INSERT INTO users (username, name, role, all_projects, password_hash, must_change, created_at) VALUES ('admin', '系统管理员', 'admin', 1, ?, 1, ?)")
        .run(hashPassword(pw), Date.now());
    }
    this.logger?.info?.(`[auth] 已创建初始管理员账号 admin（初始密码${this.config.adminPassword ? '见 ADMIN_PASSWORD' : ' admin123'}），首次登录需修改密码`);
  }

  // ---------------- 登录 / 会话 ----------------

  lockKey(username, ip) { return `${String(username).toLowerCase()}|${ip || ''}`; }

  /** 同一账号 + IP 连续失败 5 次锁定 10 分钟 */
  login({ username, password, remember }, { ip, userAgent } = {}, now = Date.now()) {
    if (!username || !password) throw err(400, '请输入用户名和密码');
    const key = this.lockKey(username, ip);
    const f = this.failures.get(key);
    if (f?.until && f.until > now) throw err(429, `登录失败次数过多，请 ${Math.ceil((f.until - now) / 60000)} 分钟后再试`);
    const u = this.db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim());
    if (!u || !verifyPassword(password, u.password_hash)) {
      const count = (f?.until && f.until <= now ? 0 : f?.count ?? 0) + 1;
      this.failures.set(key, { count, until: count >= 5 ? now + 10 * 60000 : 0 });
      throw err(401, count >= 5 ? '登录失败次数过多，账号已锁定 10 分钟' : `用户名或密码错误${count >= 3 ? `（还可尝试 ${5 - count} 次）` : ''}`);
    }
    if (!u.enabled) throw err(403, '账号已停用，请联系管理员');
    this.failures.delete(key);
    const ttl = remember ? 7 * 86400000 : 12 * 3600000;
    let token;
    if (this.config.sessionSecret) {
      // 无状态令牌：多实例（如 Vercel 无服务器函数）间无需共享会话表；修改密码后旧令牌自动失效
      token = this.signToken(u, now + ttl);
    } else {
      token = crypto.randomBytes(32).toString('base64url');
      this.db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)')
        .run(sha256(token), u.id, now, now + ttl, ip ?? null, clip(userAgent, 200));
    }
    this.db.prepare('UPDATE users SET last_login_at = ?, last_login_ip = ? WHERE id = ?').run(now, ip ?? null, u.id);
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
    return { token, expiresAt: now + ttl, user: this.publicUser(this.userById(u.id)) };
  }

  /**
   * 签名令牌：s1.<用户名>.<过期时间>.<签名>。
   * 正式环境签名包含密码哈希片段，修改密码后旧令牌失效；演示环境各实例的哈希不同（且不允许改密），不绑定密码。
   */
  signToken(u, exp) {
    const name = Buffer.from(u.username).toString('base64url');
    const bind = this.config.demoMode ? '' : u.password_hash.slice(-24);
    const sig = crypto.createHmac('sha256', this.config.sessionSecret).update(`${name}.${exp}.${bind}`).digest('base64url');
    return `s1.${name}.${exp}.${sig}`;
  }

  /** 根据会话令牌取用户；无效返回 null */
  userByToken(token, now = Date.now()) {
    if (!token) return null;
    if (token.startsWith('s1.')) {
      if (!this.config.sessionSecret) return null;
      const [, name, exp, sig] = token.split('.');
      if (!name || !exp || !sig || Number(exp) < now) return null;
      const row = this.db.prepare('SELECT id FROM users WHERE username = ?').get(Buffer.from(name, 'base64url').toString());
      const u = row ? this.userById(row.id) : null;
      if (!u || !u.enabled) return null;
      const expect = this.signToken(u, Number(exp)).split('.')[3];
      const a = Buffer.from(sig);
      const b = Buffer.from(expect);
      return a.length === b.length && crypto.timingSafeEqual(a, b) ? u : null;
    }
    const s = this.db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(sha256(token));
    if (!s || s.expires_at < now) return null;
    const u = this.userById(s.user_id);
    if (!u || !u.enabled) return null;
    return u;
  }

  logout(token) {
    if (token) this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  }

  changePassword(userId, oldPw, newPw, currentToken) {
    const u = this.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
    if (!u || !verifyPassword(oldPw, u.password_hash)) throw err(400, '原密码不正确');
    const bad = checkPasswordStrength(newPw);
    if (bad) throw err(400, bad);
    if (oldPw === newPw) throw err(400, '新密码不能与原密码相同');
    this.db.prepare('UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?').run(hashPassword(newPw), userId);
    // 其他设备上的登录全部失效
    this.db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(userId, sha256(currentToken || ''));
  }

  // ---------------- 用户 ----------------

  userById(id) {
    const u = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!u) return null;
    u.projects = this.db.prepare('SELECT p.id, p.name FROM user_projects up JOIN projects p ON p.id = up.project_id WHERE up.user_id = ? ORDER BY p.name').all(id);
    return u;
  }

  publicUser(u) {
    if (!u) return null;
    return {
      id: u.id, username: u.username, name: u.name, phone: u.phone, email: u.email, remark: u.remark,
      role: u.role, roleName: ROLES[u.role]?.name ?? u.role,
      allProjects: u.role === 'admin' || !!u.all_projects,
      projects: (u.projects || []).map((p) => ({ id: p.id, name: p.name })),
      enabled: !!u.enabled, mustChange: !!u.must_change,
      createdAt: u.created_at, lastLoginAt: u.last_login_at, lastLoginIp: u.last_login_ip,
    };
  }

  listUsers({ keyword, role } = {}) {
    let rows = this.db.prepare('SELECT id FROM users ORDER BY id').all().map((r) => this.publicUser(this.userById(r.id)));
    const k = String(keyword || '').trim().toLowerCase();
    if (k) rows = rows.filter((u) => [u.username, u.name, u.phone, u.email].some((v) => v && String(v).toLowerCase().includes(k)));
    if (role) rows = rows.filter((u) => u.role === role);
    return rows;
  }

  validateUser(b, creating) {
    const out = {};
    if (creating) {
      const username = String(b.username ?? '').trim();
      if (!/^[A-Za-z0-9_.@-]{3,32}$/.test(username)) throw err(400, '用户名为 3~32 位字母、数字或 _ . @ -');
      out.username = username;
    }
    if (b.role !== undefined) {
      if (!ROLES[b.role]) throw err(400, '角色无效');
      out.role = b.role;
    }
    for (const k of ['name', 'phone', 'email', 'remark']) if (b[k] !== undefined) out[k] = clip(b[k], k === 'remark' ? 200 : 60);
    if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw err(400, '邮箱格式不正确');
    if (b.allProjects !== undefined) out.all_projects = b.allProjects ? 1 : 0;
    if (b.enabled !== undefined) out.enabled = b.enabled ? 1 : 0;
    return out;
  }

  setUserProjects(userId, projectIds) {
    if (!Array.isArray(projectIds)) return;
    this.db.prepare('DELETE FROM user_projects WHERE user_id = ?').run(userId);
    const ins = this.db.prepare('INSERT OR IGNORE INTO user_projects (user_id, project_id) VALUES (?, ?)');
    for (const pid of projectIds) {
      if (this.db.prepare('SELECT 1 FROM projects WHERE id = ?').get(Number(pid))) ins.run(userId, Number(pid));
    }
  }

  createUser(b, now = Date.now()) {
    const v = this.validateUser(b, true);
    if (this.db.prepare('SELECT 1 FROM users WHERE username = ?').get(v.username)) throw err(409, `用户名 ${v.username} 已存在`);
    const bad = checkPasswordStrength(b.password);
    if (bad) throw err(400, bad);
    const r = this.db.prepare(`INSERT INTO users (username, name, phone, email, remark, role, all_projects, enabled, password_hash, must_change, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`).run(v.username, v.name ?? null, v.phone ?? null, v.email ?? null, v.remark ?? null,
      v.role ?? 'viewer', v.all_projects ?? 0, v.enabled ?? 1, hashPassword(b.password), now);
    const id = Number(r.lastInsertRowid);
    this.setUserProjects(id, b.projectIds ?? []);
    return this.publicUser(this.userById(id));
  }

  adminCount(excludeId) {
    return this.db.prepare("SELECT count(*) c FROM users WHERE role = 'admin' AND enabled = 1 AND id <> ?").get(excludeId ?? -1).c;
  }

  updateUser(id, b, actor) {
    const u = this.userById(id);
    if (!u) throw err(404, '用户不存在');
    const v = this.validateUser(b, false);
    const losingAdmin = u.role === 'admin' && ((v.role && v.role !== 'admin') || v.enabled === 0);
    if (losingAdmin && this.adminCount(id) === 0) throw err(400, '至少需要保留一个启用的管理员');
    if (actor?.id === id && (v.enabled === 0 || (v.role && v.role !== u.role))) throw err(400, '不能停用自己或修改自己的角色');
    const cols = Object.keys(v);
    if (cols.length) this.db.prepare(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => v[c]), id);
    if (b.projectIds !== undefined) this.setUserProjects(id, b.projectIds);
    if (v.enabled === 0) this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    return this.publicUser(this.userById(id));
  }

  resetPassword(id, password) {
    if (!this.userById(id)) throw err(404, '用户不存在');
    const bad = checkPasswordStrength(password);
    if (bad) throw err(400, bad);
    this.db.prepare('UPDATE users SET password_hash = ?, must_change = 1 WHERE id = ?').run(hashPassword(password), id);
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  }

  deleteUser(id, actor) {
    const u = this.userById(id);
    if (!u) throw err(404, '用户不存在');
    if (actor?.id === id) throw err(400, '不能删除自己');
    if (u.role === 'admin' && this.adminCount(id) === 0) throw err(400, '至少需要保留一个启用的管理员');
    this.db.prepare('DELETE FROM user_projects WHERE user_id = ?').run(id);
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }

  // ---------------- 访问范围 ----------------

  /** 用户的项目访问范围；selected 为当前在页面顶部选择的项目名 */
  scopeOf(user, selected) {
    const all = !user || user.role === 'admin' || !!user.all_projects;
    let projects = all ? null : (user.projects || []).map((p) => p.name);
    if (selected) {
      if (!all && !projects.includes(selected)) return { all: false, projects: [] };
      return { all: false, projects: [selected] };
    }
    return all ? { all: true } : { all: false, projects };
  }

  // ---------------- 项目 ----------------

  listProjects(scope, devices = []) {
    let rows = this.db.prepare('SELECT * FROM projects ORDER BY id').all();
    if (scope && !scope.all) rows = rows.filter((p) => scope.projects.includes(p.name));
    const members = new Map(this.db.prepare('SELECT project_id, count(*) n FROM user_projects GROUP BY project_id').all().map((r) => [r.project_id, r.n]));
    return rows.map((p) => {
      const ds = devices.filter((d) => d.project === p.name);
      return {
        id: p.id, name: p.name, code: p.code, owner: p.owner, contact: p.contact, address: p.address, description: p.description, createdAt: p.created_at,
        devices: ds.length,
        online: ds.filter((d) => d.online).length,
        alarming: ds.filter((d) => d.alarming).length,
        members: members.get(p.id) ?? 0,
      };
    });
  }

  validateProject(b) {
    const name = clip(b.name, 50);
    if (!name) throw err(400, '请填写项目名称');
    return {
      name,
      code: clip(b.code, 30), owner: clip(b.owner, 30), contact: clip(b.contact, 50), address: clip(b.address, 100), description: clip(b.description, 500),
    };
  }

  createProject(b, now = Date.now()) {
    const v = this.validateProject(b);
    if (this.db.prepare('SELECT 1 FROM projects WHERE name = ?').get(v.name)) throw err(409, `项目 ${v.name} 已存在`);
    const r = this.db.prepare('INSERT INTO projects (name, code, owner, contact, address, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(v.name, v.code, v.owner, v.contact, v.address, v.description, now);
    return Number(r.lastInsertRowid);
  }

  /** 修改项目；改名时同步更新设备档案中的项目名称 */
  updateProject(id, b) {
    const p = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!p) throw err(404, '项目不存在');
    const v = this.validateProject({ ...p, ...b });
    if (v.name !== p.name && this.db.prepare('SELECT 1 FROM projects WHERE name = ? AND id <> ?').get(v.name, id)) throw err(409, `项目 ${v.name} 已存在`);
    this.db.exec('BEGIN');
    try {
      this.db.prepare('UPDATE projects SET name = ?, code = ?, owner = ?, contact = ?, address = ?, description = ? WHERE id = ?')
        .run(v.name, v.code, v.owner, v.contact, v.address, v.description, id);
      if (v.name !== p.name) this.db.prepare('UPDATE devices SET project = ? WHERE project = ?').run(v.name, p.name);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  /** 删除项目：设备移出项目（不删除设备），成员关系一并删除 */
  deleteProject(id) {
    const p = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!p) throw err(404, '项目不存在');
    this.db.prepare('UPDATE devices SET project = NULL WHERE project = ?').run(p.name);
    this.db.prepare('DELETE FROM user_projects WHERE project_id = ?').run(id);
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return p.name;
  }

  /** 设置项目包含的设备（不在列表中的原项目设备移出） */
  setProjectDevices(id, deviceIds) {
    const p = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!p) throw err(404, '项目不存在');
    const ids = [...new Set((deviceIds || []).map(String))];
    this.db.exec('BEGIN');
    try {
      this.db.prepare('UPDATE devices SET project = NULL WHERE project = ?').run(p.name);
      const upd = this.db.prepare('UPDATE devices SET project = ? WHERE id = ?');
      for (const d of ids) upd.run(p.name, d);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return ids.length;
  }

  /** 设备档案里填写了新的项目名称时，自动建立项目 */
  ensureProject(name, now = Date.now()) {
    if (!name) return;
    this.db.prepare('INSERT OR IGNORE INTO projects (name, created_at) VALUES (?, ?)').run(name, now);
  }
}
