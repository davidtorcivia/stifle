import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface User {
    id: string;
    username: string;
    email: string;
    role: string;
    platform: string;
    trackingStatus: string;
    createdAt: string;
}

export function Users() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Modal states
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showResetModal, setShowResetModal] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [modalLoading, setModalLoading] = useState(false);
    const [modalError, setModalError] = useState('');

    // Add user form
    const [newUser, setNewUser] = useState({
        username: '',
        email: '',
        password: '',
        platform: 'android',
        role: 'user',
    });

    // Edit user form
    const [editUser, setEditUser] = useState({
        username: '',
        email: '',
        role: 'user',
        trackingStatus: 'pending',
    });

    // Reset password
    const [newPassword, setNewPassword] = useState('');

    useEffect(() => {
        loadUsers();
    }, [page, roleFilter]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setOpenDropdown(null);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const result = await api.getUsers({
                page,
                limit: 20,
                search: search || undefined,
                role: roleFilter !== 'all' ? roleFilter : undefined,
            });
            setUsers(result.users);
            setTotalPages(result.pagination.totalPages);
            setTotal(result.pagination.total);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = () => {
        setPage(1);
        loadUsers();
    };

    const openDeleteConfirm = (user: User) => {
        setSelectedUser(user);
        setShowDeleteConfirm(true);
        setOpenDropdown(null);
    };

    const handleDelete = async () => {
        if (!selectedUser) return;
        setModalLoading(true);
        try {
            await api.deleteUser(selectedUser.id);
            setShowDeleteConfirm(false);
            setSelectedUser(null);
            loadUsers();
        } catch (err: any) {
            setModalError(err.message);
        } finally {
            setModalLoading(false);
        }
    };

    const handleAddUser = async () => {
        setModalError('');
        setModalLoading(true);
        try {
            await api.post('/admin/users', newUser);
            setShowAddModal(false);
            setNewUser({ username: '', email: '', password: '', platform: 'android', role: 'user' });
            loadUsers();
        } catch (err: any) {
            setModalError(err.message);
        } finally {
            setModalLoading(false);
        }
    };

    const openEditModal = (user: User) => {
        setSelectedUser(user);
        setEditUser({
            username: user.username,
            email: user.email,
            role: user.role,
            trackingStatus: user.trackingStatus,
        });
        setModalError('');
        setShowEditModal(true);
        setOpenDropdown(null);
    };

    const handleEditUser = async () => {
        if (!selectedUser) return;
        setModalError('');
        setModalLoading(true);
        try {
            await api.updateUser(selectedUser.id, editUser);
            setShowEditModal(false);
            loadUsers();
        } catch (err: any) {
            setModalError(err.message);
        } finally {
            setModalLoading(false);
        }
    };

    const openResetModal = (user: User) => {
        setSelectedUser(user);
        setNewPassword('');
        setModalError('');
        setShowResetModal(true);
        setOpenDropdown(null);
    };

    const handleResetPassword = async () => {
        if (!selectedUser || !newPassword) return;
        setModalError('');
        setModalLoading(true);
        try {
            await api.post(`/admin/users/${selectedUser.id}/reset-password`, { password: newPassword });
            setShowResetModal(false);
        } catch (err: any) {
            setModalError(err.message);
        } finally {
            setModalLoading(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'verified':
                return <span className="badge badge-success">Verified</span>;
            case 'pending':
                return <span className="badge badge-warning">Pending</span>;
            case 'broken':
                return <span className="badge badge-danger">Broken</span>;
            default:
                return <span className="badge">{status}</span>;
        }
    };

    // Check if user can be deleted (prevent deleting other admins who joined before you)
    const canDeleteUser = (user: User) => {
        // Can't delete other admins - only the first admin can delete admins
        // For now, prevent deleting any admin except yourself (which is also blocked on backend)
        if (user.role === 'admin') {
            return false;
        }
        return true;
    };

    return (
        <div>
            <div className="page-header flex justify-between items-center">
                <div>
                    <h2>Users</h2>
                    <p>Manage registered users ({total} total)</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                    + Add User
                </button>
            </div>

            <div className="search-bar">
                <input
                    type="text"
                    className="form-input"
                    placeholder="Search by username or email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <select
                    className="form-input"
                    style={{ width: 'auto' }}
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                >
                    <option value="all">All Roles</option>
                    <option value="admin">Admin</option>
                    <option value="user">User</option>
                </select>
                <button className="btn btn-secondary" onClick={handleSearch}>
                    Search
                </button>
            </div>

            <div className="card" style={{ overflow: 'visible' }}>
                <div className="table-container" style={{ overflow: 'visible' }}>
                    <table>
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>Email</th>
                                <th>Platform</th>
                                <th>Status</th>
                                <th>Role</th>
                                <th>Joined</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="text-muted">Loading...</td>
                                </tr>
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="text-muted">No users found</td>
                                </tr>
                            ) : (
                                users.map((user) => (
                                    <tr key={user.id}>
                                        <td>{user.username}</td>
                                        <td>{user.email}</td>
                                        <td style={{ textTransform: 'capitalize' }}>{user.platform}</td>
                                        <td>{getStatusBadge(user.trackingStatus)}</td>
                                        <td>
                                            <span className={`badge ${user.role === 'admin' ? 'badge-info' : ''}`}>
                                                {user.role}
                                            </span>
                                        </td>
                                        <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                                        <td>
                                            <div className="dropdown" ref={openDropdown === user.id ? dropdownRef : null}>
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => setOpenDropdown(openDropdown === user.id ? null : user.id)}
                                                >
                                                    Actions ▾
                                                </button>
                                                {openDropdown === user.id && (
                                                    <div className="dropdown-menu">
                                                        <button className="dropdown-item" onClick={() => openEditModal(user)}>
                                                            Edit User
                                                        </button>
                                                        <button className="dropdown-item" onClick={() => openResetModal(user)}>
                                                            Reset Password
                                                        </button>
                                                        {canDeleteUser(user) && (
                                                            <>
                                                                <div className="dropdown-divider" />
                                                                <button
                                                                    className="dropdown-item danger"
                                                                    onClick={() => openDeleteConfirm(user)}
                                                                >
                                                                    Delete User
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {totalPages > 1 && (
                    <div className="pagination">
                        <button onClick={() => setPage(p => p - 1)} disabled={page <= 1}>
                            ◂ Prev
                        </button>
                        <span className="current">Page {page} of {totalPages}</span>
                        <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
                            Next ▸
                        </button>
                    </div>
                )}
            </div>

            {/* Add User Modal */}
            <Modal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                title="Add New User"
                footer={
                    <>
                        <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" onClick={handleAddUser} disabled={modalLoading}>
                            {modalLoading ? 'Creating...' : 'Create User'}
                        </button>
                    </>
                }
            >
                {modalError && <div className="login-error">{modalError}</div>}
                <div className="form-group">
                    <label className="form-label">Username</label>
                    <input
                        type="text"
                        className="form-input"
                        value={newUser.username}
                        onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    />
                </div>
                <div className="form-group">
                    <label className="form-label">Email</label>
                    <input
                        type="email"
                        className="form-input"
                        value={newUser.email}
                        onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    />
                </div>
                <div className="form-group">
                    <label className="form-label">Password</label>
                    <input
                        type="password"
                        className="form-input"
                        value={newUser.password}
                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    />
                </div>
                <div className="flex gap-4">
                    <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">Platform</label>
                        <select
                            className="form-input"
                            value={newUser.platform}
                            onChange={(e) => setNewUser({ ...newUser, platform: e.target.value })}
                        >
                            <option value="android">Android</option>
                            <option value="ios">iOS</option>
                        </select>
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">Role</label>
                        <select
                            className="form-input"
                            value={newUser.role}
                            onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                        >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                </div>
            </Modal>

            {/* Edit User Modal */}
            <Modal
                isOpen={showEditModal}
                onClose={() => setShowEditModal(false)}
                title={`Edit User: ${selectedUser?.username}`}
                footer={
                    <>
                        <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" onClick={handleEditUser} disabled={modalLoading}>
                            {modalLoading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </>
                }
            >
                {modalError && <div className="login-error">{modalError}</div>}
                <div className="form-group">
                    <label className="form-label">Username</label>
                    <input
                        type="text"
                        className="form-input"
                        value={editUser.username}
                        onChange={(e) => setEditUser({ ...editUser, username: e.target.value })}
                    />
                </div>
                {/* Email editing allowed for non-admin users */}
                {selectedUser?.role !== 'admin' && (
                    <div className="form-group">
                        <label className="form-label">Email</label>
                        <input
                            type="email"
                            className="form-input"
                            value={editUser.email}
                            onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                        />
                    </div>
                )}
                {/* Role editing only for non-admin users to prevent confusion */}
                {selectedUser?.role !== 'admin' && (
                    <div className="form-group">
                        <label className="form-label">Role</label>
                        <select
                            className="form-input"
                            value={editUser.role}
                            onChange={(e) => setEditUser({ ...editUser, role: e.target.value })}
                        >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                )}
                <div className="form-group">
                    <label className="form-label">Tracking Status</label>
                    <select
                        className="form-input"
                        value={editUser.trackingStatus}
                        onChange={(e) => setEditUser({ ...editUser, trackingStatus: e.target.value })}
                    >
                        <option value="pending">Pending</option>
                        <option value="verified">Verified</option>
                        <option value="broken">Broken</option>
                    </select>
                </div>
            </Modal>

            {/* Reset Password Modal */}
            <Modal
                isOpen={showResetModal}
                onClose={() => setShowResetModal(false)}
                title={`Reset Password: ${selectedUser?.username}`}
                footer={
                    <>
                        <button className="btn btn-secondary" onClick={() => setShowResetModal(false)}>
                            Cancel
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleResetPassword}
                            disabled={modalLoading || !newPassword}
                        >
                            {modalLoading ? 'Resetting...' : 'Reset Password'}
                        </button>
                    </>
                }
            >
                {modalError && <div className="login-error">{modalError}</div>}
                <p className="text-muted mb-4">
                    Enter a new password for this user. They will need to use this password on their next login.
                </p>
                <div className="form-group">
                    <label className="form-label">New Password</label>
                    <input
                        type="password"
                        className="form-input"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password (min 8 characters)"
                    />
                </div>
            </Modal>

            {/* Delete Confirm Dialog */}
            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleDelete}
                title="Delete User"
                message={
                    <>
                        Are you sure you want to delete <strong>{selectedUser?.username}</strong>?
                        This will permanently remove all their data and cannot be undone.
                    </>
                }
                confirmText="Delete User"
                confirmDanger
                loading={modalLoading}
            />
        </div>
    );
}
