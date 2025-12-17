import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface Invite {
    code: string;
    creatorUsername: string;
    usedByUsername: string | null;
    isUsed: boolean;
    isExpired: boolean;
    expiresAt: string;
    createdAt: string;
}

export function Invites() {
    const [invites, setInvites] = useState<Invite[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [newCount, setNewCount] = useState(5);
    const [newDays, setNewDays] = useState(90);
    const [creating, setCreating] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createdCodes, setCreatedCodes] = useState<string[]>([]);
    const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
    const [selectedCode, setSelectedCode] = useState<string | null>(null);
    const [revokeLoading, setRevokeLoading] = useState(false);

    useEffect(() => {
        loadInvites();
    }, [page]);

    const loadInvites = async () => {
        setLoading(true);
        try {
            const result = await api.getInvites({ page, limit: 20 });
            setInvites(result.invites);
            setTotalPages(result.pagination.totalPages);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        setCreating(true);
        try {
            const result = await api.createInvites(newCount, newDays);
            setCreatedCodes(result.codes);
            setShowCreateModal(true);
            loadInvites();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setCreating(false);
        }
    };

    const openRevokeConfirm = (code: string) => {
        setSelectedCode(code);
        setShowRevokeConfirm(true);
    };

    const handleRevoke = async () => {
        if (!selectedCode) return;
        setRevokeLoading(true);
        try {
            await api.revokeInvite(selectedCode);
            setShowRevokeConfirm(false);
            setSelectedCode(null);
            loadInvites();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setRevokeLoading(false);
        }
    };

    const getStatusBadge = (invite: Invite) => {
        if (invite.isUsed) {
            return <span className="badge badge-info">Used</span>;
        }
        if (invite.isExpired) {
            return <span className="badge badge-danger">Expired</span>;
        }
        return <span className="badge badge-success">Available</span>;
    };

    return (
        <div>
            <div className="page-header">
                <h2>Invite Codes</h2>
                <p>Manage registration invite codes</p>
            </div>

            <div className="card mb-4">
                <div className="card-header">
                    <h3 className="card-title">Generate New Codes</h3>
                </div>
                <div className="flex gap-4 items-center">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Count</label>
                        <input
                            type="number"
                            className="form-input"
                            style={{ width: 80 }}
                            min={1}
                            max={50}
                            value={newCount}
                            onChange={(e) => setNewCount(Number(e.target.value))}
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Expires in (days)</label>
                        <input
                            type="number"
                            className="form-input"
                            style={{ width: 80 }}
                            min={1}
                            max={365}
                            value={newDays}
                            onChange={(e) => setNewDays(Number(e.target.value))}
                        />
                    </div>
                    <button
                        className="btn btn-primary"
                        onClick={handleCreate}
                        disabled={creating}
                        style={{ marginTop: 'auto' }}
                    >
                        {creating ? 'Creating...' : 'Generate'}
                    </button>
                </div>
            </div>

            <div className="card">
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Status</th>
                                <th>Creator</th>
                                <th>Used By</th>
                                <th>Expires</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="text-muted">Loading...</td>
                                </tr>
                            ) : invites.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="text-muted">No invite codes found</td>
                                </tr>
                            ) : (
                                invites.map((invite) => (
                                    <tr key={invite.code}>
                                        <td><code>{invite.code}</code></td>
                                        <td>{getStatusBadge(invite)}</td>
                                        <td>{invite.creatorUsername}</td>
                                        <td>{invite.usedByUsername || '-'}</td>
                                        <td>{new Date(invite.expiresAt).toLocaleDateString()}</td>
                                        <td>{new Date(invite.createdAt).toLocaleDateString()}</td>
                                        <td>
                                            {!invite.isUsed && (
                                                <button
                                                    className="btn btn-danger btn-sm"
                                                    onClick={() => openRevokeConfirm(invite.code)}
                                                >
                                                    Revoke
                                                </button>
                                            )}
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

            {/* Created Codes Modal */}
            <Modal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                title="Invite Codes Created"
                footer={
                    <button className="btn btn-primary" onClick={() => setShowCreateModal(false)}>
                        Done
                    </button>
                }
            >
                <p className="mb-4">The following invite codes have been generated:</p>
                <div style={{ background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: '0.5rem' }}>
                    {createdCodes.map(code => (
                        <div key={code} style={{ fontFamily: 'monospace', marginBottom: '0.5rem' }}>
                            {code}
                        </div>
                    ))}
                </div>
            </Modal>

            {/* Revoke Confirm Dialog */}
            <ConfirmDialog
                isOpen={showRevokeConfirm}
                onClose={() => setShowRevokeConfirm(false)}
                onConfirm={handleRevoke}
                title="Revoke Invite Code"
                message={
                    <>
                        Are you sure you want to revoke the invite code <code>{selectedCode}</code>?
                        This code will no longer be usable for registration.
                    </>
                }
                confirmText="Revoke Code"
                confirmDanger
                loading={revokeLoading}
            />
        </div>
    );
}
