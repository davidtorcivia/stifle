import { useState, useEffect } from 'react';
import { api } from '../api/client';

interface Settings {
    smtp: {
        host: string;
        port: number;
        user: string;
        pass: string;
        from: string;
        enabled: boolean;
    };
    backup: {
        autoEnabled: boolean;
        keepLast: number;
        scheduleHour: number;
    };
    app: {
        registrationOpen: boolean;
        maintenanceMode: boolean;
    };
}

export function Settings() {
    const [settings, setSettings] = useState<Settings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const result = await api.getSettings() as Settings;
            setSettings(result);
        } catch (err: any) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!settings) return;
        setSaving(true);
        setMessage('');
        try {
            await api.updateSettings(settings);
            setMessage('Settings saved successfully');
        } catch (err: any) {
            setMessage(`Error: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="text-muted">Loading...</div>;
    if (!settings) return <div className="text-muted">Failed to load settings</div>;

    return (
        <div>
            <div className="page-header">
                <h2>Settings</h2>
                <p>Configure application settings</p>
            </div>

            {message && (
                <div className={`card mb-4 ${message.startsWith('Error') ? 'login-error' : ''}`} style={{ padding: '0.75rem 1rem' }}>
                    {message}
                </div>
            )}

            <div className="card mb-4">
                <div className="card-header">
                    <h3 className="card-title">Application</h3>
                </div>
                <div className="flex gap-4">
                    <div className="form-group">
                        <label className="flex gap-2 items-center">
                            <input
                                type="checkbox"
                                checked={settings.app.registrationOpen}
                                onChange={(e) => setSettings({
                                    ...settings,
                                    app: { ...settings.app, registrationOpen: e.target.checked }
                                })}
                            />
                            Open Registration (allow signups without invite codes)
                        </label>
                    </div>
                    <div className="form-group">
                        <label className="flex gap-2 items-center">
                            <input
                                type="checkbox"
                                checked={settings.app.maintenanceMode}
                                onChange={(e) => setSettings({
                                    ...settings,
                                    app: { ...settings.app, maintenanceMode: e.target.checked }
                                })}
                            />
                            Maintenance Mode
                        </label>
                    </div>
                </div>
            </div>

            <div className="card mb-4">
                <div className="card-header">
                    <h3 className="card-title">SMTP (Email)</h3>
                </div>
                <div className="form-group">
                    <label className="flex gap-2 items-center">
                        <input
                            type="checkbox"
                            checked={settings.smtp.enabled}
                            onChange={(e) => setSettings({
                                ...settings,
                                smtp: { ...settings.smtp, enabled: e.target.checked }
                            })}
                        />
                        Enable SMTP
                    </label>
                </div>
                <div className="flex gap-4">
                    <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">Host</label>
                        <input
                            type="text"
                            className="form-input"
                            value={settings.smtp.host}
                            onChange={(e) => setSettings({
                                ...settings,
                                smtp: { ...settings.smtp, host: e.target.value }
                            })}
                            placeholder="smtp.example.com"
                        />
                    </div>
                    <div className="form-group" style={{ width: 100 }}>
                        <label className="form-label">Port</label>
                        <input
                            type="number"
                            className="form-input"
                            value={settings.smtp.port}
                            onChange={(e) => setSettings({
                                ...settings,
                                smtp: { ...settings.smtp, port: Number(e.target.value) }
                            })}
                        />
                    </div>
                </div>
                <div className="flex gap-4">
                    <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">Username</label>
                        <input
                            type="text"
                            className="form-input"
                            value={settings.smtp.user}
                            onChange={(e) => setSettings({
                                ...settings,
                                smtp: { ...settings.smtp, user: e.target.value }
                            })}
                        />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">Password</label>
                        <input
                            type="password"
                            className="form-input"
                            value={settings.smtp.pass}
                            onChange={(e) => setSettings({
                                ...settings,
                                smtp: { ...settings.smtp, pass: e.target.value }
                            })}
                        />
                    </div>
                </div>
                <div className="form-group">
                    <label className="form-label">From Address</label>
                    <input
                        type="email"
                        className="form-input"
                        value={settings.smtp.from}
                        onChange={(e) => setSettings({
                            ...settings,
                            smtp: { ...settings.smtp, from: e.target.value }
                        })}
                        placeholder="noreply@stifleapp.com"
                    />
                </div>
            </div>

            <div className="card mb-4">
                <div className="card-header">
                    <h3 className="card-title">Backups</h3>
                </div>
                <div className="form-group">
                    <label className="flex gap-2 items-center">
                        <input
                            type="checkbox"
                            checked={settings.backup.autoEnabled}
                            onChange={(e) => setSettings({
                                ...settings,
                                backup: { ...settings.backup, autoEnabled: e.target.checked }
                            })}
                        />
                        Enable Automatic Backups
                    </label>
                </div>
                <div className="flex gap-4">
                    <div className="form-group">
                        <label className="form-label">Keep Last N Backups</label>
                        <input
                            type="number"
                            className="form-input"
                            style={{ width: 100 }}
                            value={settings.backup.keepLast}
                            onChange={(e) => setSettings({
                                ...settings,
                                backup: { ...settings.backup, keepLast: Number(e.target.value) }
                            })}
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Schedule Hour (UTC)</label>
                        <input
                            type="number"
                            className="form-input"
                            style={{ width: 100 }}
                            min={0}
                            max={23}
                            value={settings.backup.scheduleHour}
                            onChange={(e) => setSettings({
                                ...settings,
                                backup: { ...settings.backup, scheduleHour: Number(e.target.value) }
                            })}
                        />
                    </div>
                </div>
            </div>

            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Settings'}
            </button>
        </div>
    );
}
