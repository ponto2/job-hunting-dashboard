import { apiFetch } from './api-client';

// Company, selection, and event writes shared by the company list and the
// kanban board, with their toasts. Company and event writes return whether
// they succeeded so the caller can keep its form (and the user's input) open
// on failure. Selection writes throw instead, so SelectionModal can show the
// error inside the dialog.
export function createCompanyActions({ onShowToast, onCompaniesChange, onEventsChange }) {
  return {
    async saveCompany(data) {
      try {
        await apiFetch('/api/companies', { method: data.id ? 'PUT' : 'POST', body: data });
        onShowToast(data.id ? '企業情報を更新しました' : '企業を追加しました');
        onCompaniesChange();
        return true;
      } catch (error) {
        onShowToast(`企業情報を保存できませんでした。${error.message || '時間をおいて再度お試しください'}`, { tone: 'error' });
        return false;
      }
    },

    async deleteCompany(id) {
      try {
        await apiFetch(`/api/companies?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        onShowToast('企業を削除しました');
        onCompaniesChange();
        // Its events were deleted with it.
        onEventsChange?.();
        return true;
      } catch (error) {
        onShowToast(`企業を削除できませんでした。${error.message}`, { tone: 'error' });
        return false;
      }
    },

    async saveSelection(data) {
      await apiFetch('/api/selections', { method: data.id ? 'PUT' : 'POST', body: data });
      onShowToast(data.id ? '選考を更新しました' : '選考を追加しました');
      await onCompaniesChange();
    },

    async deleteSelection(selection) {
      await apiFetch(`/api/selections?id=${encodeURIComponent(selection.id)}`, { method: 'DELETE' });
      onShowToast('選考を削除しました');
      await onCompaniesChange();
    },

    async addEvent(data) {
      try {
        await apiFetch('/api/events', { method: 'POST', body: data });
        onShowToast('カレンダーにイベントを追加しました');
        onEventsChange?.();
        return true;
      } catch (error) {
        onShowToast(`イベントを追加できませんでした。${error.message}`, { tone: 'error' });
        return false;
      }
    },
  };
}
