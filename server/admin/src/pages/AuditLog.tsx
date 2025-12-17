import { useState, useEffect } from 'react';
import { api } from '../api/client';

interface AuditEntry {
    id: string;
    action: string;
    targetType: string;
    targetId: string;
    details: any;
    ipAddress: string;
    adminUsername: string;
    createdAt: string;
}

export function AuditLog() {
    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    useEffect(() => {
        loadEntries();
    }, [page]);

    const loadEntries = async () => {
        setLoading(true);
        try {
            const result = await api.getAuditLog({ page, limit: 20 });
            setEntries(result.entries);
            setTotalPages(result.pagination.totalPages);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const formatAction = (action: string) => {
        return action.replace('.', ' ').replace(/([A-Z])/g, ' $1').trim();
    };

    return (
        <div>
            <div className="page-header">
                <h2>Audit Log</h2>
                <p>View admin activity history</p>
            </div>

            <div className="card">
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Action</th>
                                <th>Admin</th>
                                <th>Target</th>
                                <th>Details</th>
                                <th>IP Address</th>
                                <th>Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="text-muted">Loading...</td>
                                </tr>
                            ) : entries.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="text-muted">No audit entries found</td>
                                </tr>
                            ) : (
                                entries.map((entry) => (
                                    <tr key={entry.id}>
                                        <td>
                                            <span className="badge badge-info">{formatAction(entry.action)}</span>
                                        </td>
                                        <td>{entry.adminUsername}</td>
                                        <td>
                                            {entry.targetType && (
                                                <>
                                                    <span className="text-muted">{entry.targetType}:</span>{' '}
                                                    <code className="text-sm">{entry.targetId?.slice(0, 8) || '-'}</code>
                                                </>
                                            )}
                                        </td>
                                        <td>
                                            {entry.details && (
                                                <details>
                                                    <summary className="text-sm" style={{ cursor: 'pointer' }}>View</summary>
                                                    <pre className="text-sm" style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'var(--bg-tertiary)', borderRadius: '0.25rem', overflow: 'auto' }}>
                                                        {JSON.stringify(entry.details, null, 2)}
                                                    </pre>
                                                </details>
                                            )}
                                        </td>
                                        <td><code className="text-sm">{entry.ipAddress}</code></td>
                                        <td>{new Date(entry.createdAt).toLocaleString()}</td>
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
        </div>
    );
}
