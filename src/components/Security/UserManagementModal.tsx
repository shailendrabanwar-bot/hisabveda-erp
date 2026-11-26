import React, { useState } from 'react';
import { Users, Shield, UserPlus, LogIn, CheckCircle2, Key, Lock, UserCheck, X, KeyRound } from 'lucide-react';
import { AppData, UserRole, UserProfile } from '../../types';
import {
  ALL_USER_ROLES,
  ROLE_METADATA,
  RolePermissions,
  canManageTargetRole,
  getRolePermissions,
  normalizeUserRole
} from '../../utils/rbac';

interface UserManagementModalProps {
  data?: AppData;
  isHindi: boolean;
  activeUser?: UserProfile | null;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
  onSwitchUser: (user: UserProfile) => void;
  registeredUsers?: UserProfile[];
  onAddUser?: (user: UserProfile) => void;
  onRegisterUser?: (user: UserProfile) => void;
  onUpdateUserRole?: (userId: string, newRole: UserRole) => void;
  onLogout?: () => void;
  onOpenMasterPinModal?: () => void;
  isCustomerView?: boolean;
  onClose: () => void;
}

export const defaultUserProfiles: UserProfile[] = [
  {
    id: 'usr_admin',
    name: 'Shailendra Banwar (Admin)',
    role: 'ADMIN',
    email: 'shailendrabanwar@gmail.com',
    pin: '',
    permissions: ['all']
  },
  {
    id: 'usr_accountant',
    name: 'Priya Verma (Sr. Accountant)',
    role: 'ACCOUNTANT',
    email: 'accountant@taxerp.in',
    pin: '2026',
    permissions: ['vouchers', 'invoices', 'reports']
  },
  {
    id: 'usr_billing',
    name: 'Amit Patel (Billing Executive)',
    role: 'BILLING',
    email: 'billing@taxerp.in',
    pin: '0000',
    permissions: ['invoices', 'parties']
  },
  {
    id: 'usr_auditor',
    name: 'CA Suresh Gupta (Tax Auditor)',
    role: 'AUDITOR',
    email: 'auditor@ca.in',
    pin: '9999',
    permissions: ['reports', 'audit']
  }
];

export const UserManagementModal: React.FC<UserManagementModalProps> = ({
  data,
  isHindi,
  activeUser,
  activeUserRole,
  permissions,
  onSwitchUser,
  registeredUsers,
  onAddUser,
  onRegisterUser,
  onUpdateUserRole,
  onLogout,
  onOpenMasterPinModal,
  isCustomerView = false,
  onClose
}) => {
  const fallbackAdmin: UserProfile = {
    id: activeUser?.id || 'usr_admin',
    name: activeUser?.name || data?.company?.name || 'Administrator',
    role: 'ADMIN',
    email: activeUser?.email || data?.company?.email || 'admin@company.com',
    pin: data?.securityPin || '',
    permissions: ['all']
  };

  const currentActiveUser = activeUser || fallbackAdmin;
  const actorRole = normalizeUserRole(activeUserRole || currentActiveUser.role);
  const rbac = permissions || getRolePermissions(actorRole);
  const currentRoleMeta = ROLE_METADATA[actorRole];

  const [usersList, setUsersList] = useState<UserProfile[]>(() => {
    const source =
      (registeredUsers && registeredUsers.length > 0) ? registeredUsers
      : (data?.usersList && data.usersList.length > 0) ? data.usersList
      : (data?.userProfiles && data.userProfiles.length > 0) ? data.userProfiles
      : [fallbackAdmin];

    const cleaned = source.filter(
      u => !['shailendrabanwar@gmail.com', 'accountant@taxerp.in', 'billing@taxerp.in', 'auditor@ca.in'].includes((u.email || '').toLowerCase())
    );

    if (currentActiveUser && !cleaned.some(u => u.id === currentActiveUser.id || u.email === currentActiveUser.email)) {
      return [currentActiveUser, ...cleaned];
    }
    return cleaned.length > 0 ? cleaned : [currentActiveUser];
  });

  const [selectedUserToSwitch, setSelectedUserToSwitch] = useState<UserProfile | null>(null);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Add User Form
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('ACCOUNTANT');
  const [newPin, setNewPin] = useState('');

  const handleSwitchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserToSwitch) return;

    if (selectedUserToSwitch.pin && selectedUserToSwitch.pin !== enteredPin) {
      setPinError(isHindi ? 'गलत पिन कोड! पुनः प्रयास करें।' : 'Incorrect User PIN. Please try again.');
      return;
    }

    onSwitchUser(selectedUserToSwitch);
    onClose();
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rbac.canManageUsersAndPin) return;
    if (!newName) return;

    const newUser: UserProfile = {
      id: 'usr_' + Date.now(),
      name: newName,
      role: newRole,
      email: newEmail || `${newName.toLowerCase().replace(/\s+/g, '')}@company.com`,
      pin: newPin.trim(),
      permissions: newRole === 'ADMIN' ? ['all'] : [newRole.toLowerCase()]
    };

    if (onAddUser) onAddUser(newUser);
    if (onRegisterUser) onRegisterUser(newUser);

    setUsersList(prev => [...prev, newUser]);
    setShowAddUserForm(false);
    setNewName('');
    setNewEmail('');
    setNewPin('');
    setFeedbackMsg(isHindi ? `नया उपयोगकर्ता "${newName}" (${newRole}) सफलतापूर्वक बनाया गया!` : `User "${newName}" (${newRole}) registered successfully!`);
  };

  const handleRoleSelectChange = (targetUser: UserProfile, nextRole: UserRole) => {
    if (!rbac.canManageUsersAndPin || !canManageTargetRole(actorRole, targetUser.role)) return;
    setUsersList(prev => prev.map(u => u.id === targetUser.id ? { ...u, role: nextRole } : u));
    if (onUpdateUserRole) onUpdateUserRole(targetUser.id, nextRole);
    setFeedbackMsg(
      isHindi
        ? `${targetUser.name} की भूमिका बदलकर "${nextRole}" कर दी गई।`
        : `Updated role for ${targetUser.name} to ${nextRole}.`
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 text-slate-200 space-y-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isHindi ? 'मल्टी-यूज़र लॉगिन एवं उपयोगकर्ता स्विच केंद्र' : 'Multi-User Authentication & User Switching'}
              </h3>
              <p className="text-xs text-slate-400">
                {isHindi 
                  ? 'सुरक्षित उपयोगकर्ता प्रोफाइल बदलें या अन्य स्टाफ/ऑपरेटर लॉगिन जोड़ें' 
                  : 'Switch logged-in operator account or add new staff logins'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-xl hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Inline Feedback Banner */}
        {feedbackMsg && (
          <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{feedbackMsg}</span>
            </span>
            <button type="button" onClick={() => setFeedbackMsg(null)} className="text-emerald-300 hover:text-white cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Current Active User Banner */}
        <div className="bg-gradient-to-r from-indigo-900/40 via-slate-800 to-slate-900 border border-indigo-500/30 p-4 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-extrabold flex items-center justify-center text-sm shadow">
                {currentActiveUser?.name ? currentActiveUser.name.charAt(0) : 'U'}
              </div>
              <div>
                <div className="text-xs text-indigo-300 font-semibold">{isHindi ? 'वर्तमान में लॉग-इन उपयोगकर्ता:' : 'Currently Logged In As:'}</div>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <span>{currentActiveUser?.name || 'User'}</span>
                  <span className={`border text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${currentRoleMeta.badgeColor}`}>
                    {actorRole}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[11px] text-slate-400 block">{currentActiveUser?.email || ''}</span>
              <span className="text-[10px] text-emerald-400 font-semibold flex items-center justify-end gap-1">
                <UserCheck className="w-3.5 h-3.5" /> Session Active
              </span>
            </div>
          </div>
          <p className="text-[11px] text-slate-300 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-1.5">
            {isHindi ? currentRoleMeta.summaryHi : currentRoleMeta.summaryEn}
          </p>
        </div>

        {/* User Switching Section */}
        {!selectedUserToSwitch ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                {isHindi ? 'अन्य उपयोगकर्ता के रूप में लॉगिन करें (Select Account to Switch):' : 'Select User Account to Switch Login:'}
              </h4>

              {rbac.canManageUsersAndPin && (
                <div className="flex items-center gap-2">
                  {onOpenMasterPinModal && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenMasterPinModal();
                      }}
                      className="flex items-center gap-1.5 text-xs font-bold text-amber-300 hover:text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 px-3 py-1.5 rounded-xl transition cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                      <span>{isHindi ? '🔑 मास्टर पिन बदलें' : '🔑 Change Master PIN'}</span>
                    </button>
                  )}

                  <button
                    onClick={() => setShowAddUserForm(!showAddUserForm)}
                    className="flex items-center gap-1.5 text-xs font-bold text-indigo-300 hover:text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 px-3 py-1.5 rounded-xl transition cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{showAddUserForm ? 'Cancel' : (isHindi ? '+ नया यूज़र बनाएं' : '+ Add New User')}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Add User Form */}
            {showAddUserForm && rbac.canManageUsersAndPin && (
              <form onSubmit={handleCreateUser} className="bg-slate-800/80 p-4 rounded-xl border border-amber-500/30 space-y-3 text-xs animate-fadeIn">
                <h5 className="font-bold text-amber-300 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4" /> Register New Operator / Staff Account
                </h5>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Full Name *</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Ramesh Kumar"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Role & Privilege *</label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as UserRole)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-white"
                    >
                      {ALL_USER_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {isHindi ? ROLE_METADATA[r].labelHi : ROLE_METADATA[r].labelEn}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <p className="text-[11px] text-slate-300 bg-slate-900/80 border border-slate-700/80 rounded-lg px-2.5 py-1.5">
                  {isHindi ? ROLE_METADATA[newRole].summaryHi : ROLE_METADATA[newRole].summaryEn}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Email Address</label>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="ramesh@company.com"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">4-Digit Access PIN Code *</label>
                    <input
                      type="password"
                      maxLength={4}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value)}
                      placeholder="e.g. 1234"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-white font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="submit"
                    className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow cursor-pointer"
                  >
                    Save & Register User
                  </button>
                </div>
              </form>
            )}

            {/* List of Switchable Users */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {usersList.map((user) => {
                const isCurrent = currentActiveUser && user.id === currentActiveUser.id;
                const userRole = normalizeUserRole(user.role);
                const meta = ROLE_METADATA[userRole];
                const canChangeThisRole =
                  rbac.canManageUsersAndPin &&
                  !isCurrent &&
                  canManageTargetRole(actorRole, userRole);

                return (
                  <div
                    key={user.id}
                    onClick={() => {
                      if (!isCurrent) {
                        setSelectedUserToSwitch(user);
                        setEnteredPin('');
                        setPinError('');
                      }
                    }}
                    className={`p-3.5 rounded-xl border transition cursor-pointer space-y-2 ${
                      isCurrent 
                        ? 'bg-indigo-950/30 border-indigo-500/40 opacity-90' 
                        : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 hover:border-indigo-500/50 shadow'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-slate-700 text-indigo-300 font-bold flex items-center justify-center text-xs border border-slate-600 shrink-0">
                          {user.name ? user.name.charAt(0) : 'U'}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                            <span className="truncate">{user.name}</span>
                            {isCurrent && <span className="text-[9px] bg-indigo-600 text-white px-1.5 py-0.2 rounded shrink-0">(Active)</span>}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">{user.email}</div>
                        </div>
                      </div>

                      {canChangeThisRole ? (
                        <select
                          value={userRole}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleRoleSelectChange(user, e.target.value as UserRole)}
                          className={`text-[10px] font-mono border px-2 py-1 rounded-lg bg-slate-900 cursor-pointer ${meta.badgeColor}`}
                        >
                          {ALL_USER_ROLES.map((r) => (
                            <option key={r} value={r} className="bg-slate-900 text-slate-100">
                              {r}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`text-[10px] font-mono border px-2 py-1 rounded-lg shrink-0 ${meta.badgeColor}`}>
                          {userRole}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* PIN Verification prompt when switching user */
          <form onSubmit={handleSwitchSubmit} className="bg-slate-800 p-5 rounded-2xl border border-indigo-500/40 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-indigo-400" />
                <span>Switching User to: <strong className="text-indigo-300">{selectedUserToSwitch.name}</strong></span>
              </h4>

              <button
                type="button"
                onClick={() => setSelectedUserToSwitch(null)}
                className="text-xs text-slate-400 hover:text-white"
              >
                ← Back to User List
              </button>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold text-xs mb-1">
                Enter 4-Digit Security PIN for {selectedUserToSwitch.name}:
              </label>
              <input
                type="password"
                maxLength={6}
                autoFocus
                value={enteredPin}
                onChange={(e) => {
                  setEnteredPin(e.target.value);
                  setPinError('');
                }}
                placeholder="Enter Security PIN"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-center text-lg font-mono tracking-widest text-white focus:border-indigo-500 focus:outline-none"
              />
              {pinError && <p className="text-xs text-rose-400 mt-1 font-semibold">{pinError}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedUserToSwitch(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-1.5"
              >
                <LogIn className="w-4 h-4" />
                <span>Switch Active Login</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
