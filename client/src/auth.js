// Mock SSO only -- no real authentication. See Login.jsx.

const KEY = 'loopsentinel.mockUser';

const MOCK_USER = {
  name: 'Jordan Diaz',
  email: 'jordan.diaz@example-corp.test',
  initials: 'JD',
};

export function signIn() {
  sessionStorage.setItem(KEY, JSON.stringify(MOCK_USER));
}

export function signOut() {
  sessionStorage.removeItem(KEY);
}

export function getUser() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isAuthed() {
  return !!getUser();
}
