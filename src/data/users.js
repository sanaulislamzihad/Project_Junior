import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const AUTH_STORAGE_KEY = 'nsu_plagichecker_auth';

function getAuthHeaders() {
    try {
        const saved = localStorage.getItem(AUTH_STORAGE_KEY);
        if (saved) {
            const user = JSON.parse(saved);
            if (user?.token) {
                return { Authorization: `Bearer ${user.token}` };
            }
        }
    } catch (_) {}
    return {};
}

// ==================== AUTH API ====================

export const loginUser = async (email, password, role) => {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
        email,
        password,
        role,
    });
    return response.data; // { success, user, token }
};

export const registerUser = async ({ name, email, password, nsuId }) => {
    const response = await axios.post(`${API_BASE_URL}/auth/register`, {
        name,
        email,
        password,
        nsu_id: nsuId,
    });
    return response.data; // { success, user }
};

// ==================== ADMIN API ====================

export const getUsers = async () => {
    const response = await axios.get(`${API_BASE_URL}/auth/users`, {
        headers: getAuthHeaders(),
    });
    return response.data.users; // array of user objects
};

export const addUser = async ({ name, email, password, role }) => {
    const headers = getAuthHeaders();
    if (role === 'teacher') {
        const response = await axios.post(`${API_BASE_URL}/auth/users/teacher`, {
            name,
            email,
            password,
        }, { headers });
        return response.data; // { success, user }
    }
    // For students added by admin, use register endpoint
    const response = await axios.post(`${API_BASE_URL}/auth/register`, {
        name,
        email,
        password,
    });
    return response.data;
};

export const removeUser = async (userId) => {
    const response = await axios.delete(`${API_BASE_URL}/auth/users/${userId}`, {
        headers: getAuthHeaders(),
    });
    return response.data; // { success }
};
