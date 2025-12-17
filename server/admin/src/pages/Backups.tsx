import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface Backup {
    id: string;
    filename: string;
    sizeBytes: number;
    type: string;
    status: string;
    createdAt: string;
    completedAt: string;
}

export function Backups() {
    const [backups, setBackups] = useState<Backup[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadBackups();
    }, [page]);

    const loadBackups = async () => {
        setLoading(true);
        try {
            const result = await api.getBackups({ page, limit: 20 });
            setBackups(result.backups);
            setTotalPages(result.pagination.totalPages);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        setCreating(true);
        setMessage('');
        try {
            const result = await api.createBackup();
            setMessage(`Backup created: ${result.filename}`);
            loadBackups();
        } catch (err: any) {
            setMessage(`Error: ${err.message}`);
        } finally {
            setCreating(false);
        }
    };

    const openDeleteConfirm = (backup: Backup) => {
        setSelectedBackup(backup);
        setShowDeleteConfirm(true);
    };

    const handleDelete = async () => {
        if (!selectedBackup) return;
        setDeleteLoading(true);
        try {
            await api.deleteBackup(selectedBackup.id);
            setShowDeleteConfirm(false);
            setSelectedBackup(null);
            loadBackups();
        } catch (err: any) {
            setMessage(`Error: ${err.message}`);
        } finally {
            setDeleteLoading(false);
        }
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'completed':
                return <span className="badge badge-success">Completed</span>;
            case 'pending':
                return <span className="badge badge-warning">Pending</span>;
            case 'failed':
                return <span className="badge badge-danger">Failed</span>;
            default:
                return <span className="badge">{status}</span>;
        }
    };

    return (
        <div>
            <div className="page-header flex justify-between items-center">
                <div>
                    <h2>Backups</h2>
                    <p>Database backup management</p>
                </div>
                <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
                    {creating ? 'Creating...' : '+ Create Backup'}
                </button>
            </div>

            {message && (
                <div className={message.startsWith('Error') ? 'login-error' : 'success-message'}>
                    {message}
                </div>
            )}

            <div className="card">
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Filename</th>
                                <th>Size</th>
                                <th>Type</th>
                                <th>Status</th>
                                <th>Created</th>
                                <th>Completed</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="text-muted">Loading...</td>
                                </tr>
                            ) : backups.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="text-muted">No backups found. Create your first backup above.</td>
                                </tr>
                            ) : (
                                backups.map((backup) => (
                                    <tr key={backup.id}>
                                        <td><code>{backup.filename}</code></td>
                                        <td>{formatBytes(backup.sizeBytes)}</td>
                                        <td style={{ textTransform: 'capitalize' }}>{backup.type}</td>
                                        <td>{getStatusBadge(backup.status)}</td>
                                        <td>{new Date(backup.createdAt).toLocaleString()}</td>
                                        <td>{backup.completedAt ? new Date(backup.completedAt).toLocaleString() : '-'}</td>
                                        <td>
                                            <button
                                                className="btn btn-danger btn-sm"
                                                onClick={() => openDeleteConfirm(backup)}
                                            >
                                                Delete
                                            </button>
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

            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleDelete}
                title="Delete Backup"
                message={
                    <>
                        Are you sure you want to delete the backup <code>{selectedBackup?.filename}</code>?
                        This cannot be undone.
                    </>
                }
                confirmText="Delete Backup"
                confirmDanger
                loading={deleteLoading}
            />
        </div>
    );
}
