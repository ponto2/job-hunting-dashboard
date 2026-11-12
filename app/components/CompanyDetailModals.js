'use client';

import { useState } from 'react';
import { formatDateInput } from '@/lib/date';
import { getEntryCompanyIds } from '@/lib/es-entries';
import CompanyDeleteDialog from './CompanyDeleteDialog';
import DetailModal from './DetailModal';
import EditModal from './EditModal';
import EventModal from './EventModal';

// The company detail modal and the dialogs it opens (edit, add to calendar,
// delete), shared by the company list and the kanban board. Each view decides
// how selections are added or edited from the detail.
export default function CompanyDetailModals({
  company,
  hidden = false,
  companies,
  events = [],
  esEntries = [],
  interviewMemos = [],
  actions,
  onClose,
  onAddSelection,
  onEditSelection,
  onAddES,
  onOpenES,
}) {
  const [editingId, setEditingId] = useState(null);
  const [calendarCompanyId, setCalendarCompanyId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const findCompany = id => (id ? companies.find(item => item.id === id) || null : null);
  const editing = findCompany(editingId);
  const calendarCompany = findCompany(calendarCompanyId);
  const deleting = findCompany(deletingId);

  return (
    <>
      {company && !hidden && (
        <DetailModal
          company={company}
          onClose={onClose}
          onEdit={() => { setEditingId(company.id); onClose(); }}
          onDelete={() => setDeletingId(company.id)}
          onAddSelection={onAddSelection && (() => onAddSelection(company))}
          onEditSelection={onEditSelection && (selection => onEditSelection(selection, company))}
          onAddToCalendar={() => { setCalendarCompanyId(company.id); onClose(); }}
          onAddES={() => { onAddES?.(company.id); onClose(); }}
          onOpenES={() => { onOpenES?.(company.id); onClose(); }}
          relatedEvents={events.filter(event => event.company_id === company.id)}
          relatedEsEntries={esEntries.filter(entry => getEntryCompanyIds(entry).includes(company.id))}
        />
      )}
      {editing && (
        <EditModal
          company={editing}
          companies={companies}
          onClose={() => setEditingId(null)}
          onSave={async data => { if (await actions.saveCompany(data)) setEditingId(null); }}
        />
      )}
      {calendarCompany && (
        <EventModal
          key={calendarCompany.id}
          event={null}
          defaultDate={formatDateInput()}
          companies={companies}
          initialCompanyId={calendarCompany.id}
          onClose={() => setCalendarCompanyId(null)}
          onSave={async data => { if (await actions.addEvent(data)) setCalendarCompanyId(null); }}
          onDelete={() => {}}
        />
      )}
      {deleting && (
        <CompanyDeleteDialog
          company={deleting}
          events={events}
          esEntries={esEntries}
          interviewMemos={interviewMemos}
          onCancel={() => setDeletingId(null)}
          onConfirm={async () => {
            setDeletingId(null);
            if (await actions.deleteCompany(deleting.id)) onClose();
          }}
        />
      )}
    </>
  );
}
