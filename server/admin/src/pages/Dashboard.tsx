import { useState, useEffect } from 'react';
import { api } from '../api/client';

interface DashboardData {
    totalUsers: number;
    activeUsers: number;
    eventsToday: number;
    totalGroups: number;
    pendingInvites: number;
    waitlistCount: number;
    usersByPlatform: Record<string, number>;
    usersByTrackingStatus: Record<string, number>;
    recentSignups: Array<{ date: string; count: number }>;
    scoring: {
        totalPointsAllTime: number;
        pointsThisWeek: number;
        pointsPerDay: Array<{ date: string; points: number }>;
    };
}

export function Dashboard() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const result = await api.getDashboard() as DashboardData;
            setData(result);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const formatNumber = (num: number) => {
        return num.toLocaleString();
    };

    if (loading) return <div className="text-muted">Loading...</div>;
    if (error) return <div className="text-muted">Error: {error}</div>;
    if (!data) return null;

    return (
        <div>
            <div className="page-header">
                <h2>Dashboard</h2>
                <p>Overview of your Stifle instance</p>
            </div>

            {/* Primary Stats */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="label">Total Users</div>
                    <div className="value">{formatNumber(data.totalUsers)}</div>
                </div>
                <div className="stat-card">
                    <div className="label">Active Users (7d)</div>
                    <div className="value">{formatNumber(data.activeUsers)}</div>
                </div>
                <div className="stat-card">
                    <div className="label">Events Today</div>
                    <div className="value">{formatNumber(data.eventsToday)}</div>
                </div>
                <div className="stat-card">
                    <div className="label">Groups</div>
                    <div className="value">{formatNumber(data.totalGroups)}</div>
                </div>
                <div className="stat-card">
                    <div className="label">Pending Invites</div>
                    <div className="value">{formatNumber(data.pendingInvites)}</div>
                </div>
                <div className="stat-card">
                    <div className="label">Waitlist</div>
                    <div className="value">{formatNumber(data.waitlistCount)}</div>
                </div>
            </div>

            {/* Scoring Stats */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="label">Total Points (All Time)</div>
                    <div className="value">{formatNumber(data.scoring.totalPointsAllTime)}</div>
                </div>
                <div className="stat-card">
                    <div className="label">Points This Week</div>
                    <div className="value">{formatNumber(data.scoring.pointsThisWeek)}</div>
                </div>
            </div>

            <div className="flex gap-4 mb-4">
                {/* Users by Platform */}
                <div className="card" style={{ flex: 1 }}>
                    <div className="card-header">
                        <h3 className="card-title">Users by Platform</h3>
                    </div>
                    <div className="table-container">
                        <table>
                            <tbody>
                                {Object.entries(data.usersByPlatform).map(([platform, count]) => (
                                    <tr key={platform}>
                                        <td style={{ textTransform: 'capitalize' }}>{platform}</td>
                                        <td style={{ textAlign: 'right' }}>{count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Users by Tracking Status */}
                <div className="card" style={{ flex: 1 }}>
                    <div className="card-header">
                        <h3 className="card-title">Tracking Status</h3>
                    </div>
                    <div className="table-container">
                        <table>
                            <tbody>
                                {Object.entries(data.usersByTrackingStatus).map(([status, count]) => (
                                    <tr key={status}>
                                        <td style={{ textTransform: 'capitalize' }}>{status}</td>
                                        <td style={{ textAlign: 'right' }}>{count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div className="flex gap-4">
                {/* Recent Signups */}
                <div className="card" style={{ flex: 1 }}>
                    <div className="card-header">
                        <h3 className="card-title">Recent Signups (7 days)</h3>
                    </div>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th style={{ textAlign: 'right' }}>Count</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.recentSignups.length === 0 ? (
                                    <tr>
                                        <td colSpan={2} className="text-muted">No signups in the last 7 days</td>
                                    </tr>
                                ) : (
                                    data.recentSignups.map((row) => (
                                        <tr key={row.date}>
                                            <td>{new Date(row.date).toLocaleDateString()}</td>
                                            <td style={{ textAlign: 'right' }}>{row.count}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Points Per Day */}
                <div className="card" style={{ flex: 1 }}>
                    <div className="card-header">
                        <h3 className="card-title">Points Per Day (7 days)</h3>
                    </div>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th style={{ textAlign: 'right' }}>Points</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.scoring.pointsPerDay.length === 0 ? (
                                    <tr>
                                        <td colSpan={2} className="text-muted">No data yet</td>
                                    </tr>
                                ) : (
                                    data.scoring.pointsPerDay.map((row) => (
                                        <tr key={row.date}>
                                            <td>{new Date(row.date).toLocaleDateString()}</td>
                                            <td style={{ textAlign: 'right' }}>{formatNumber(row.points)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
