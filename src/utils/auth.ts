/**
 * Auth utility untuk menyelaraskan token otentikasi di seluruh frontend
 */
export function getAuthToken(): string {
  return (
    localStorage.getItem('rpa9s_auth_token') ||
    localStorage.getItem('rpa_auth_token') ||
    ''
  );
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function saveAuthToken(token: string, expiresAt?: string) {
  localStorage.setItem('rpa9s_auth_token', token);
  localStorage.setItem('rpa_auth_token', token);
  if (expiresAt) {
    localStorage.setItem('rpa9s_auth_expires', expiresAt);
  }
}

export function clearAuthToken() {
  localStorage.removeItem('rpa9s_auth_token');
  localStorage.removeItem('rpa_auth_token');
  localStorage.removeItem('rpa9s_auth_expires');
}
