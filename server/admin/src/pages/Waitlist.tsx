import { useState, useEffect } from 'react';
import { api } from '../api/client';

interface WaitlistEntry {
    id: string;
    email: string;
    createdAt: string;
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export function Waitlist() {
    const [entries, setEntries] = useState<WaitlistEntry[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [page, setPage] = useState(1);

    useEffect(() => {
        loadData();
    }, [page]);

    const loadData = async () => {
        try {
            setLoading(true);
            const result = await api.getWaitlist({ page, limit: 20 });
            setEntries(result.entries);
            setPagination(result.pagination);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string, email: string) => {
        if (!confirm(`Remove ${email} from waitlist?`)) return;

        try {
            await api.deleteWaitlistEntry(id);
            loadData();
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        }
    };

    const copyAllEmails = () => {
        const emails = entries.map(e => e.email).join('\n');
        navigator.clipboard.writeText(emails);
        alert('Copied to clipboard!');
    };

    if (loading && entries.length === 0) return <div className="text-muted">Loading...</div>;
    if (error) return <div className="text-muted">Error: {error}</div>;

    return (
        <div>
            <div className="page-header">
                <h2>Waitlist</h2>
                <p>People who signed up for the waitlist on the landing page</p>
            </div>

            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">
                        {pagination?.total || 0} entries
                    </h3>
                    {entries.length > 0 && (
                        <button className="btn btn-secondary" onClick={copyAllEmails}>
                            Copy All Emails
                        </button>
                    )}
                </div>

                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Email</th>
                                <th>Signed Up</th>
                                <th style={{ width: 100 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="text-muted">No waitlist entries yet</td>
                                </tr>
                            ) : (
                                entries.map((entry) => (
                                    <tr key={entry.id}>
                                        <td>{entry.email}</td>
                                        <td>{new Date(entry.createdAt).toLocaleString()}</td>
                                        <td>
                                            <button
                                                className="btn btn-sm btn-danger"
                                                onClick={() => handleDelete(entry.id, entry.email)}
                                            >
                                                Remove
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {pagination && pagination.totalPages > 1 && (
                    <div className="pagination">
                        <button
                            className="btn btn-secondary"
                            disabled={page <= 1}
                            onClick={() => setPage(p => p - 1)}
                        >
                            Previous
                        </button>
                        <span className="text-muted">
                            Page {pagination.page} of {pagination.totalPages}
                        </span>
                        <button
                            className="btn btn-secondary"
                            disabled={page >= pagination.totalPages}
                            onClick={() => setPage(p => p + 1)}
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
