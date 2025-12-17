import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface Group {
    id: string;
    name: string;
    description: string;
    isPrivate: boolean;
    inviteCode: string;
    creatorUsername: string;
    memberCount: number;
    createdAt: string;
}

export function Groups() {
    const [groups, setGroups] = useState<Group[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    useEffect(() => {
        loadGroups();
    }, [page]);

    const loadGroups = async () => {
        setLoading(true);
        try {
            const result = await api.getGroups({ page, limit: 20 });
            setGroups(result.groups);
            setTotalPages(result.pagination.totalPages);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const openDeleteConfirm = (group: Group) => {
        setSelectedGroup(group);
        setShowDeleteConfirm(true);
    };

    const handleDelete = async () => {
        if (!selectedGroup) return;
        setDeleteLoading(true);
        try {
            await api.deleteGroup(selectedGroup.id);
            setShowDeleteConfirm(false);
            setSelectedGroup(null);
            loadGroups();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setDeleteLoading(false);
        }
    };

    return (
        <div>
            <div className="page-header">
                <h2>Groups</h2>
                <p>Manage competition groups</p>
            </div>

            <div className="card" style={{ overflow: 'visible' }}>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Creator</th>
                                <th>Members</th>
                                <th>Type</th>
                                <th>Invite Code</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="text-muted">Loading...</td>
                                </tr>
                            ) : groups.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="text-muted">No groups found</td>
                                </tr>
                            ) : (
                                groups.map((group) => (
                                    <tr key={group.id}>
                                        <td>
                                            <strong>{group.name}</strong>
                                            {group.description && (
                                                <div className="text-sm text-muted">{group.description}</div>
                                            )}
                                        </td>
                                        <td>{group.creatorUsername}</td>
                                        <td>{group.memberCount}</td>
                                        <td>
                                            <span className={`badge ${group.isPrivate ? 'badge-warning' : 'badge-success'}`}>
                                                {group.isPrivate ? 'Private' : 'Public'}
                                            </span>
                                        </td>
                                        <td><code>{group.inviteCode || '-'}</code></td>
                                        <td>{new Date(group.createdAt).toLocaleDateString()}</td>
                                        <td>
                                            <button
                                                className="btn btn-danger btn-sm"
                                                onClick={() => openDeleteConfirm(group)}
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
                title="Delete Group"
                message={
                    <>
                        Are you sure you want to delete the group <strong>{selectedGroup?.name}</strong>?
                        All members will be removed and this cannot be undone.
                    </>
                }
                confirmText="Delete Group"
                confirmDanger
                loading={deleteLoading}
            />
        </div>
    );
}
