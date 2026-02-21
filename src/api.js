import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000';

export const analyzePdf = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await axios.post(`${API_BASE_URL}/analyze`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    } catch (error) {
        if (error.response) {
            throw new Error(error.response.data.detail || 'Analysis failed');
        }
        throw error;
    }
};

export const getRepositoryFiles = async () => {
    const response = await axios.get(`${API_BASE_URL}/repository`);
    return response.data;
};
