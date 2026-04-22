const ACCESS_SESSION_ID_KEY = "access_session_id";
const ACCESS_SESSION_EXPIRY_KEY = "access_session_expiry";
const LEGACY_ACCESS_SESSION_EXPIRY_KEY = "access_session_expires_at";

const getExpiryDate = (expiryValue) => {
  if (!expiryValue) {
    return null;
  }

  const expiryDate = new Date(expiryValue);
  return Number.isNaN(expiryDate.getTime()) ? null : expiryDate;
};

export const clearDoctorAccessSession = () => {
  sessionStorage.removeItem(ACCESS_SESSION_ID_KEY);
  sessionStorage.removeItem(ACCESS_SESSION_EXPIRY_KEY);
  sessionStorage.removeItem(LEGACY_ACCESS_SESSION_EXPIRY_KEY);

  localStorage.removeItem(ACCESS_SESSION_ID_KEY);
  localStorage.removeItem(ACCESS_SESSION_EXPIRY_KEY);
  localStorage.removeItem(LEGACY_ACCESS_SESSION_EXPIRY_KEY);
};

export const saveDoctorAccessSession = (accessSessionId, accessSessionExpiry) => {
  if (!accessSessionId) {
    return false;
  }

  sessionStorage.setItem(ACCESS_SESSION_ID_KEY, accessSessionId);
  if (accessSessionExpiry) {
    sessionStorage.setItem(ACCESS_SESSION_EXPIRY_KEY, accessSessionExpiry);
    sessionStorage.setItem(LEGACY_ACCESS_SESSION_EXPIRY_KEY, accessSessionExpiry);
  }

  localStorage.removeItem(ACCESS_SESSION_ID_KEY);
  localStorage.removeItem(ACCESS_SESSION_EXPIRY_KEY);
  localStorage.removeItem(LEGACY_ACCESS_SESSION_EXPIRY_KEY);

  return true;
};

export const getActiveDoctorAccessSession = () => {
  let accessSessionId = sessionStorage.getItem(ACCESS_SESSION_ID_KEY);
  let accessSessionExpiry = sessionStorage.getItem(ACCESS_SESSION_EXPIRY_KEY) || sessionStorage.getItem(LEGACY_ACCESS_SESSION_EXPIRY_KEY);

  if (!accessSessionId) {
    accessSessionId = localStorage.getItem(ACCESS_SESSION_ID_KEY);
    accessSessionExpiry = localStorage.getItem(ACCESS_SESSION_EXPIRY_KEY) || localStorage.getItem(LEGACY_ACCESS_SESSION_EXPIRY_KEY);

    if (accessSessionId) {
      sessionStorage.setItem(ACCESS_SESSION_ID_KEY, accessSessionId);
      if (accessSessionExpiry) {
        sessionStorage.setItem(ACCESS_SESSION_EXPIRY_KEY, accessSessionExpiry);
        sessionStorage.setItem(LEGACY_ACCESS_SESSION_EXPIRY_KEY, accessSessionExpiry);
      }

      localStorage.removeItem(ACCESS_SESSION_ID_KEY);
      localStorage.removeItem(ACCESS_SESSION_EXPIRY_KEY);
      localStorage.removeItem(LEGACY_ACCESS_SESSION_EXPIRY_KEY);
    }
  }

  if (!accessSessionId) {
    return null;
  }

  const expiryDate = getExpiryDate(accessSessionExpiry);
  if (!expiryDate || expiryDate.getTime() <= Date.now()) {
    clearDoctorAccessSession();
    return null;
  }

  return {
    accessSessionId,
    accessSessionExpiry: expiryDate.toISOString(),
  };
};

export const getDoctorAccessHeaders = (token) => {
  const headers = { Authorization: `Bearer ${token}` };
  const accessSession = getActiveDoctorAccessSession();

  if (accessSession?.accessSessionId) {
    headers["X-Access-Session-ID"] = accessSession.accessSessionId;
  }

  return headers;
};
