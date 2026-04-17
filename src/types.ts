export type ToolStatus = 'available' | 'borrowed' | 'maintenance' | 'lost';

export interface Tool {
  id: string;
  name: string;
  category: string;
  brand: string;
  serialNumber: string;
  status: ToolStatus;
  location: string;
  lastMaintenance?: string;
  nextMaintenance?: string;
  purchaseDate: string;
  imageUrl?: string;
}

export interface Loan {
  id: string;
  toolId?: string;
  toolName: string; // Tools Desc
  typeSize: string; // PN/Type/Size
  borrowerName: string; // Name
  section: string; // Section
  shift: 'Day' | 'Night'; // Shift
  borrowDate: string; // Automatic date and time
  returnDate?: string;
  status: 'active' | 'returned';
}

export interface MaintenanceLog {
  id: string;
  toolId?: string;
  toolName: string;
  date: string;
  description: string;
  cost: number;
  technician: string;
}

export type InspectionStatus = 'Good' | 'Bad' | 'Broken' | 'N/A';

export interface DailyInspection {
  id: string;
  date: string;
  toolboxId: string;
  inspector: string;
  items: {
    toolDetailId: string;
    status: InspectionStatus;
    notes?: string;
  }[];
}

export interface InventoryItem {
  id: string;
  toolId: string;
  category: string;
  merk: string;
  toolDesc: string;
  typeSize: string;
  qty: number;
  condition?: InspectionStatus;
  lastInspectionDate?: string;
}

export interface ToolboxDetail {
  id: string;
  merk: string;
  toolDesc: string;
  typeSize: string;
  qty: number;
  condition?: InspectionStatus;
}

export interface Toolbox {
  id: string;
  idToolbox: string;
  name: string;
  nrp: string;
  section: string;
  toolCount: number;
  badCount?: number;
  brokenCount?: number;
  naCount?: number;
  lastInspectionDate?: string;
}

export interface ToolroomInspection {
  id: string;
  date: string;
  inspector: string;
  items: {
    inventoryItemId: string;
    status: InspectionStatus;
    notes?: string;
  }[];
}

export interface ProgressOrder {
  id: string;
  date: string;
  merk: string;
  toolDesc: string;
  typeSize: string;
  qty: number;
  vendor: string;
  pr: string;
  po: string;
  status: string;
  remarks: string;
}
