/** @type {Record<string, string>} */
const dashboardByRole = {
  ADMIN: '/',
  DOSEN: '/lecturer',
  STUDENT: '/student',
  PIMPINAN: '/leadership'
};

/** @param {string | null | undefined} role */
export function dashboardForRole(role) {
  return role ? dashboardByRole[role] ?? null : null;
}

/** @param {string} pathname */
export function isPublicAuthPath(pathname) {
  return ['/login', '/forgot-password', '/reset-password'].includes(pathname);
}

/** @param {string} pathname @param {string} path */
function isPathOrDescendant(pathname, path) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** @param {string | null | undefined} role @param {string} pathname */
export function roleCanAccessPath(role, pathname) {
  if (isPublicAuthPath(pathname)) return dashboardForRole(role) !== null;
  if (role === 'ADMIN') {
    return !['/lecturer', '/student'].some((path) => isPathOrDescendant(pathname, path));
  }
  if (role === 'DOSEN') {
    return ['/lecturer', '/extensions', '/reports', '/notifications'].some((path) =>
      isPathOrDescendant(pathname, path)
    );
  }
  if (role === 'STUDENT') {
    return ['/student', '/notifications'].some((path) => isPathOrDescendant(pathname, path));
  }
  if (role === 'PIMPINAN') {
    return isPathOrDescendant(pathname, '/leadership') && !isPathOrDescendant(pathname, '/leadership/users');
  }
  return false;
}
