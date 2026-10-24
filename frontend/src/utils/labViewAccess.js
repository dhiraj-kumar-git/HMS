import axios from 'axios';
import CryptoJS from 'crypto-js';
import BASE_URL from './Config';

// The admin's 10-minute window for viewing lab results is kept on the server (tied to the login session).
// The browser only remembers when it ends, to show a countdown and to hide results when it does.
const UNTIL_KEY = 'lab_view_unlocked_until';

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

// The login page sends SHA-256(password), so the stored password is a bcrypt of that digest.
// The unlock prompt must send the very same value or a correct password is rejected.
export const hashPassword = (password) => CryptoJS.SHA256(password).toString(CryptoJS.enc.Hex);

export const getUnlockedUntil = () => {
  try {
    const until = Number(sessionStorage.getItem(UNTIL_KEY));
    return until > Date.now() ? until : 0;
  } catch {
    return 0;
  }
};

export const setUnlockedUntil = (until) => {
  try {
    sessionStorage.setItem(UNTIL_KEY, String(until));
  } catch {
    /* storage unavailable: the countdown simply restarts after a reload */
  }
};

export const clearLabViewUnlock = () => {
  try {
    sessionStorage.removeItem(UNTIL_KEY);
  } catch {
    /* ignore */
  }
};

export const unlockLabView = async (password) => {
  const res = await axios.post(`${BASE_URL}/api/admin/lab-reports/unlock`, { password: hashPassword(password) }, { headers: authHeaders() });
  const until = Date.now() + (res.data?.expires_in || 600) * 1000;   // counted from now, so a wrong PC clock cannot stretch it
  setUnlockedUntil(until);
  return until;
};

export const lockLabView = async () => {
  const headers = authHeaders();
  clearLabViewUnlock();
  try {
    await axios.post(`${BASE_URL}/api/admin/lab-reports/lock`, {}, { headers });
  } catch {
    /* best effort: the window ends by itself within 10 minutes */
  }
};

export const fetchLabDetails = async (visitId) => {
  const res = await axios.get(`${BASE_URL}/api/admin/lab-reports/${encodeURIComponent(visitId)}/details`, { headers: authHeaders() });
  return res.data;
};

export const openLabFile = async (visitId, index) => {
  const res = await axios.get(`${BASE_URL}/api/admin/lab-reports/${encodeURIComponent(visitId)}/file/${index}`, {
    headers: authHeaders(),
    responseType: 'blob',
  });
  window.open(URL.createObjectURL(res.data), '_blank');
};

export const isLabViewLocked = (err) => err?.response?.data?.code === 'LAB_VIEW_LOCKED';
