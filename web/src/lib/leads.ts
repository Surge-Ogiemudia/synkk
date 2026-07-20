// Desktop kept leads in electron-store, populated only from the live Pusher
// `synkk-drug-request` event — there's no REST endpoint that lists them. Same here,
// just backed by localStorage instead (per-browser rather than per-machine, which is
// the correct tradeoff for a web terminal that can be opened from any device).
const LEADS_KEY = 'synkk_leads';

export interface Lead {
  id: string;
  medicines: any[];
  location: string;
  patientPhone: string;
  hasStock: boolean;
  timestamp: number;
  status: 'pending' | 'accepted' | 'ignored';
}

export function getLeads(): Lead[] {
  try {
    const raw = localStorage.getItem(LEADS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLeads(leads: Lead[]) {
  localStorage.setItem(LEADS_KEY, JSON.stringify(leads));
}

export function addLead(data: any) {
  const leads = getLeads();
  const newLead: Lead = {
    id: data.platformRequestId || Date.now().toString(),
    medicines: data.medicines || [],
    location: data.location || 'Unknown',
    patientPhone: data.patientPhone || '',
    hasStock: !!data.hasStock,
    timestamp: Date.now(),
    status: 'pending',
  };
  if (leads.some((l) => l.id === newLead.id)) return;
  leads.unshift(newLead);
  saveLeads(leads);
}

export function updateLeadStatus(id: string, status: 'accepted' | 'ignored') {
  const leads = getLeads();
  const lead = leads.find((l) => l.id === id);
  if (lead) {
    lead.status = status;
    saveLeads(leads);
  }
  return lead;
}
