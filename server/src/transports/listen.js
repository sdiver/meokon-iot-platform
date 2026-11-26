/** 监听端口，失败（如端口被占用）时 reject 而不是让进程崩溃 */
export function listenAsync(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (e) => reject(portError(e, port));
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      resolve();
    });
  });
}

export function portError(e, port) {
  if (e.code === 'EADDRINUSE') return new Error(`端口 ${port} 已被占用`);
  if (e.code === 'EACCES') return new Error(`没有权限监听端口 ${port}`);
  return e;
}
