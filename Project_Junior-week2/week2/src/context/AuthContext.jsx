import React, { createContext, useContext, useState, useEffect } from 'react';
import { loginUser, registerUser } from '../data/users';

const AuthContext = createContext(null);

const AUTH_STORAGE_KEY = 'nsu_plagichecker_auth';

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        const saved = localStorage.getItem(AUTH_STORAGE_KEY);
        return saved ? JSON.parse(saved) : null;
    });

    useEffect(() => {
        if (user) {
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
        } else {
            localStorage.removeItem(AUTH_STORAGE_KEY);
        }
    }, [user]);

    const login = async (email, password, role) => {
        try {
            const data = await loginUser(email, password, role);
            if (data.success) {
                setUser(data.user);
                return { success: true, user: data.user };
            }
            return { success: false, error: 'Invalid response from server' };
        } catch (error) {
            const msg = error.response?.data?.detail || 'Login failed. Please check your connection.';
            return { success: false, error: msg };
        }
    };

    const register = async (userData) => {
        try {
            const data = await registerUser(userData);
            if (data.success) {
                // Registering a student doesn't necessarily log them in automatically in this flow,
                // but we could set the user if we wanted to. For now, just return success.
                return { success: true, user: data.user };
            }
            return { success: false, error: 'Registration failed' };
        } catch (error) {
            const msg = error.response?.data?.detail || 'Registration failed. Email might already exist.';
            return { success: false, error: msg };
        }
    };

    const logout = () => {
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
