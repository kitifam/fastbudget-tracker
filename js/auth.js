// Auth — no-op stubs (login removed, SQLite local DB)
const Auth = {
  async signInWithGoogle() {},
  async signOut() {},
  async getCurrentUser() { return { id: 'local', email: '', user_metadata: {} }; },
  async getSession() { return { user: { id: 'local', email: '', user_metadata: {} } }; },
  async requireAuth() { return { user: { id: 'local', email: '', user_metadata: {} } }; },
  redirectIfLoggedIn() {}
};
