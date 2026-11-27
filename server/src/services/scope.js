import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * 请求级上下文：当前用户与项目访问范围。
 * 接入服务（TCP/UDP/MQTT）等后台流程不在请求上下文中，视为全部范围。
 */
export const requestContext = new AsyncLocalStorage();

export function currentScope() {
  return requestContext.getStore()?.scope ?? { all: true };
}
export function currentUser() {
  return requestContext.getStore()?.user ?? null;
}
/** 当前操作人显示名，用于记录“谁处理了报警 / 下发了命令” */
export function currentOperator() {
  const u = currentUser();
  return u ? (u.name ? `${u.name}（${u.username}）` : u.username) : null;
}

export function inScope(project) {
  const s = currentScope();
  return s.all || (project != null && s.projects.includes(project));
}

/**
 * 生成按项目过滤设备的 SQL 条件。col 为设备编号列（如 a.device_id；设备表本身用 id）。
 * 返回 { sql, args }，全部范围时 sql 为 '1'。
 */
export function scopeSql(col = 'device_id') {
  const s = currentScope();
  if (s.all) return { sql: '1', args: [] };
  if (!s.projects.length) return { sql: '0', args: [] };
  return { sql: `${col} IN (SELECT id FROM devices WHERE project IN (${s.projects.map(() => '?').join(',')}))`, args: [...s.projects] };
}
