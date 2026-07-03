const API = import.meta.env.VITE_API_URL || "https://evident-z4te.onrender.com";

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || `Request failed (${res.status})`);
  return body;
}

export const api = {
  createCollective: (data) =>
    request("/collectives", { method: "POST", body: JSON.stringify(data) }),
  getCollective: (id) => request(`/collectives/${id}`),
  getLedger: (id) => request(`/collectives/${id}/ledger`),
  getMembers: (id) => request(`/collectives/${id}/members`),
  inviteMember: (id, data) =>
    request(`/collectives/${id}/members`, { method: "POST", body: JSON.stringify(data) }),
  getContributions: (id, memberId) =>
    request(`/collectives/${id}/members/${memberId}/contributions`),
  getExpenses: (id) => request(`/collectives/${id}/expenses`),
  submitExpense: (id, data) =>
    request(`/collectives/${id}/expenses`, { method: "POST", body: JSON.stringify(data) }),
  approveExpense: (id, expenseId, approverId) =>
    request(`/collectives/${id}/expenses/${expenseId}/approve`, {
      method: "POST",
      body: JSON.stringify({ approver_id: approverId }),
    }),
  rejectExpense: (id, expenseId, approverId, reason) =>
    request(`/collectives/${id}/expenses/${expenseId}/reject`, {
      method: "POST",
      body: JSON.stringify({ approver_id: approverId, reason }),
    }),
  getBanks: () => request("/banks"),
  getUnmatched: (id) => request(`/collectives/${id}/unmatched`),
  lookupAccount: (accountNumber, bankCode) =>
    request(`/banks/lookup?account_number=${accountNumber}&bank_code=${bankCode}`, {
      method: "POST",
    }),
};
