const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface ApiError {
    error: string;
    details?: any;
}

class ApiClient {
    private token: string | null = null;

    constructor() {
        this.token = localStorage.getItem('admin_token');
    }

    setToken(token: string | null) {
        this.token = token;
        if (token) {
            localStorage.setItem('admin_token', token);
        } else {
            localStorage.removeItem('admin_token');
        }
    }

    getToken(): string | null {
        return this.token;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {},
        isRetry: boolean = false
    ): Promise<T> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string>),
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers,
        });

        // Handle 401 - try to refresh token
        if (response.status === 401 && !isRetry && !endpoint.includes('/auth/')) {
            const refreshed = await this.tryRefreshToken();
            if (refreshed) {
                // Retry with new token
                return this.request<T>(endpoint, options, true);
            }
        }

        const data = await response.json();

        if (!response.ok) {
            const error = data as ApiError;
            throw new Error(error.error || 'Request failed');
        }

        return data as T;
    }

    private async tryRefreshToken(): Promise<boolean> {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) {
            return false;
        }

        try {
            const response = await fetch(`${API_BASE}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
            });

            if (response.ok) {
                const data = await response.json();
                this.setToken(data.accessToken);
                localStorage.setItem('refresh_token', data.refreshToken);
                return true;
            }
        } catch (e) {
            console.error('Token refresh failed:', e);
        }

        // Refresh failed - clear tokens
        this.logout();
        return false;
    }

    async get<T>(endpoint: string): Promise<T> {
        return this.request<T>(endpoint);
    }

    async post<T>(endpoint: string, body?: any): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'POST',
            body: JSON.stringify(body ?? {}),
        });
    }

    async put<T>(endpoint: string, body?: any): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'PUT',
            body: body ? JSON.stringify(body) : undefined,
        });
    }

    async delete<T>(endpoint: string): Promise<T> {
        return this.request<T>(endpoint, { method: 'DELETE' });
    }

    // Auth
    async login(email: string, password: string) {
        const result = await this.post<{
            user: { id: string; role: string; username: string };
            accessToken: string;
            refreshToken: string;
        }>('/auth/login', { email, password });

        if (result.user.role !== 'admin') {
            throw new Error('Admin access required');
        }

        this.setToken(result.accessToken);
        localStorage.setItem('refresh_token', result.refreshToken);
        return result;
    }

    logout() {
        this.setToken(null);
        localStorage.removeItem('refresh_token');
    }

    // Admin endpoints
    async getDashboard() {
        return this.get<{
            totalUsers: number;
            activeUsers: number;
            eventsToday: number;
            totalGroups: number;
            pendingInvites: number;
            usersByPlatform: Record<string, number>;
            recentSignups: Array<{ date: string; count: number }>;
        }>('/admin/dashboard');
    }

    async getUsers(params: { page?: number; limit?: number; search?: string; role?: string }) {
        const query = new URLSearchParams();
        if (params.page) query.set('page', params.page.toString());
        if (params.limit) query.set('limit', params.limit.toString());
        if (params.search) query.set('search', params.search);
        if (params.role) query.set('role', params.role);
        return this.get<{
            users: Array<{
                id: string;
                username: string;
                email: string;
                role: string;
                platform: string;
                trackingStatus: string;
                createdAt: string;
            }>;
            pagination: { page: number; limit: number; total: number; totalPages: number };
        }>(`/admin/users?${query}`);
    }

    async getUser(id: string) {
        return this.get<{
            id: string;
            username: string;
            email: string;
            role: string;
            platform: string;
            trackingStatus: string;
            timezone: string;
            createdAt: string;
            groups: Array<{ id: string; name: string; role: string }>;
            currentWeekScore: { total_points: number; streak_count: number };
            totalEvents: number;
        }>(`/admin/users/${id}`);
    }

    async updateUser(id: string, data: { role?: string; trackingStatus?: string; username?: string; email?: string }) {
        return this.put<{ success: boolean }>(`/admin/users/${id}`, data);
    }

    async deleteUser(id: string) {
        return this.delete<{ success: boolean }>(`/admin/users/${id}`);
    }

    async getInvites(params: { page?: number; limit?: number }) {
        const query = new URLSearchParams();
        if (params.page) query.set('page', params.page.toString());
        if (params.limit) query.set('limit', params.limit.toString());
        return this.get<{
            invites: Array<{
                code: string;
                creatorUsername: string;
                usedByUsername: string | null;
                isUsed: boolean;
                isExpired: boolean;
                expiresAt: string;
                createdAt: string;
            }>;
            pagination: { page: number; limit: number; total: number; totalPages: number };
        }>(`/admin/invites?${query}`);
    }

    async createInvites(count: number, expiresInDays: number = 90) {
        return this.post<{ codes: string[] }>('/admin/invites', { count, expiresInDays });
    }

    async revokeInvite(code: string) {
        return this.delete<{ success: boolean }>(`/admin/invites/${code}`);
    }

    async getGroups(params: { page?: number; limit?: number }) {
        const query = new URLSearchParams();
        if (params.page) query.set('page', params.page.toString());
        if (params.limit) query.set('limit', params.limit.toString());
        return this.get<{
            groups: Array<{
                id: string;
                name: string;
                description: string;
                isPrivate: boolean;
                inviteCode: string;
                creatorUsername: string;
                memberCount: number;
                createdAt: string;
            }>;
            pagination: { page: number; limit: number; total: number; totalPages: number };
        }>(`/admin/groups?${query}`);
    }

    async deleteGroup(id: string) {
        return this.delete<{ success: boolean }>(`/admin/groups/${id}`);
    }

    async getSettings() {
        return this.get<Record<string, any>>('/admin/settings');
    }

    async updateSettings(settings: any) {
        return this.put<{ success: boolean }>('/admin/settings', settings);
    }

    async getAuditLog(params: { page?: number; limit?: number }) {
        const query = new URLSearchParams();
        if (params.page) query.set('page', params.page.toString());
        if (params.limit) query.set('limit', params.limit.toString());
        return this.get<{
            entries: Array<{
                id: string;
                action: string;
                targetType: string;
                targetId: string;
                details: any;
                ipAddress: string;
                adminUsername: string;
                createdAt: string;
            }>;
            pagination: { page: number; limit: number; total: number; totalPages: number };
        }>(`/admin/audit-log?${query}`);
    }

    async getBackups(params: { page?: number; limit?: number }) {
        const query = new URLSearchParams();
        if (params.page) query.set('page', params.page.toString());
        if (params.limit) query.set('limit', params.limit.toString());
        return this.get<{
            backups: Array<{
                id: string;
                filename: string;
                sizeBytes: number;
                type: string;
                status: string;
                createdAt: string;
                completedAt: string;
            }>;
            pagination: { page: number; limit: number; total: number; totalPages: number };
        }>(`/admin/backups?${query}`);
    }

    async createBackup() {
        return this.post<{ id: string; filename: string; message: string }>('/admin/backups');
    }

    async deleteBackup(id: string) {
        return this.delete<{ success: boolean }>(`/admin/backups/${id}`);
    }
}

export const api = new ApiClient();
