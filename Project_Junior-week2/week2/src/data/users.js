import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000';

// ==================== AUTH API ====================

export const loginUser = async (email, password, role) => {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
        email,
        password,
        role,
    });
    return response.data; // { success, user }
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
    const response = await axios.get(`${API_BASE_URL}/auth/users`);
    return response.data.users; // array of user objects
};

export const addUser = async ({ name, email, password, role }) => {
    if (role === 'teacher') {
        const response = await axios.post(`${API_BASE_URL}/auth/users/teacher`, {
            name,
            email,
            password,
        });
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
    const response = await axios.delete(`${API_BASE_URL}/auth/users/${userId}`);
    return response.data; // { success }
};
