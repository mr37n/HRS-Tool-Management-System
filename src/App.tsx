import React, { useState, useMemo, useEffect } from 'react';
import { INITIAL_INVENTORY, INITIAL_TOOLBOX_DETAILS, INITIAL_TOOLBOXES } from './constants';
import * as XLSX from 'xlsx';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  query,
  orderBy,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { db, auth, signInWithGoogle, signInWithId, logout, handleFirestoreError, OperationType } from './firebase';
import { 
  LayoutDashboard, 
  Wrench, 
  History, 
  Plus, 
  Search, 
  Filter, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  MoreVertical,
  LogOut,
  User,
  Lock,
  Key,
  Settings,
  Menu,
  X,
  ChevronRight,
  ArrowRightLeft,
  Calendar,
  ShieldCheck,
  Package,
  Briefcase,
  Users,
  ClipboardList,
  Layers,
  ChevronDown,
  ChevronUp,
  Database,
  ShoppingCart,
  ClipboardCheck,
  Printer,
  FileText,
  Pencil,
  RotateCcw,
  Trash2,
  Eye,
  EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { Loan, DailyInspection, ToolroomInspection, InspectionStatus, MaintenanceLog, ToolboxDetail, Toolbox, InventoryItem, ProgressOrder } from './types';
import { MOCK_LOANS } from './constants';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Tab = 'dashboard' | 'loans' | 'maintenance' | 'settings' | 'master-toolbox' | 'master-inventory' | 'master-detail-toolbox' | 'progress-order' | 'inspection-daily' | 'inspection-toolroom';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  useEffect(() => {
    document.title = "Tool Management System";
  }, []);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [dailyInspections, setDailyInspections] = useState<DailyInspection[]>([]);
  const [toolroomInspections, setToolroomInspections] = useState<ToolroomInspection[]>([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>([]);
  const [toolboxes, setToolboxes] = useState<Toolbox[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [progressOrders, setProgressOrders] = useState<ProgressOrder[]>([]);
  
  const [loanStatusFilter, setLoanStatusFilter] = useState<'all' | 'active' | 'returned'>('all');
  const [loanSectionFilter, setLoanSectionFilter] = useState('all');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [toolboxDetailsSortOrder, setToolboxDetailsSortOrder] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMasterDataOpen, setIsMasterDataOpen] = useState(false);
  const [isAddLoanModalOpen, setIsAddLoanModalOpen] = useState(false);
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);
  const [isAddToolboxModalOpen, setIsAddToolboxModalOpen] = useState(false);
  const [isAddInventoryModalOpen, setIsAddInventoryModalOpen] = useState(false);
  const [isAddDetailToolboxModalOpen, setIsAddDetailToolboxModalOpen] = useState(false);
  const [isAddOrderModalOpen, setIsAddOrderModalOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [isInspectionOpen, setIsInspectionOpen] = useState(false);
  const [toast, setToast] = useState<{ show: boolean; message: string }>({ show: false, message: '' });
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const [successDialog, setSuccessDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isIdLogin, setIsIdLogin] = useState(false);

  const isSuperAdmin = user?.email === 'nasori.bm37@gmail.com';

  const cleanupDuplicates = async () => {
    if (!isSuperAdmin) return;
    
    setConfirmDialog({
      isOpen: true,
      title: 'Cleanup Duplicates',
      message: 'This will remove duplicate entries from Inventory, Toolboxes, and local Tool Details. Are you sure?',
      onConfirm: async () => {
        try {
          showToast("Cleaning up duplicates...");
          
          // 1. Cleanup Inventory Items (by toolId)
          const invSnapshot = await getDocs(collection(db, 'inventoryItems'));
          const invMap = new Map();
          const invDeletes: string[] = [];
          
          invSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const key = data.toolId?.trim();
            if (!key) return; // Skip items without valid toolId
            
            if (invMap.has(key)) {
              invDeletes.push(doc.id);
            } else {
              invMap.set(key, doc.id);
            }
          });
          
          for (const id of invDeletes) {
            await deleteDoc(doc(db, 'inventoryItems', id));
          }

          // 2. Cleanup Toolboxes (by idToolbox)
          const tbSnapshot = await getDocs(collection(db, 'toolboxes'));
          const tbMap = new Map();
          const tbDeletes: string[] = [];
          
          tbSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const key = data.idToolbox?.trim();
            if (!key) return; // Skip items without valid idToolbox
            
            if (tbMap.has(key)) {
              tbDeletes.push(doc.id);
            } else {
              tbMap.set(key, doc.id);
            }
          });
          
          for (const id of tbDeletes) {
            await deleteDoc(doc(db, 'toolboxes', id));
          }

          // 3. Cleanup local Toolbox Details (by toolDesc + typeSize)
          const detailMap = new Map();
          const uniqueDetails = toolboxDetails.filter(detail => {
            const key = `${detail.toolDesc?.trim()}|${detail.typeSize?.trim()}`;
            if (!detail.toolDesc?.trim()) return true; // Keep items with empty desc to avoid data loss
            
            if (detailMap.has(key)) return false;
            detailMap.set(key, true);
            return true;
          });
          
          const removedDetailsCount = toolboxDetails.length - uniqueDetails.length;
          setToolboxDetails(uniqueDetails);

          showToast(`Cleanup complete! Removed ${invDeletes.length} inventory items, ${tbDeletes.length} toolboxes, and ${removedDetailsCount} detail items.`);
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'cleanup');
        }
      }
    });
  };

  const handleIdLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signInWithId(loginId, loginPassword);
      showToast("Logged in successfully!");
    } catch (error) {
      showToast("Login failed. Check ID/Password.");
    }
  };

  const showToast = (message: string) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: '' }), 3000);
  };

  const [selectedToolboxId, setSelectedToolboxId] = useState<string>('');
  const [inspectionResults, setInspectionResults] = useState<Record<string, InspectionStatus>>({});
  const [inspectionNotes, setInspectionNotes] = useState<Record<string, string>>({});

  const [newLoan, setNewLoan] = useState<Partial<Loan>>({
    status: 'active',
    section: 'Track',
    shift: 'Day',
    toolName: '',
    typeSize: '',
    borrowerName: '',
    borrowDate: ''
  });

  const [isAddMaintenanceModalOpen, setIsAddMaintenanceModalOpen] = useState(false);
  const [editingMaintenanceId, setEditingMaintenanceId] = useState<string | null>(null);

  const [newMaintenanceLog, setNewMaintenanceLog] = useState<Partial<MaintenanceLog>>({
    date: new Date().toISOString().split('T')[0],
    toolName: '',
    description: '',
    cost: 0,
    technician: ''
  });

  const [toolboxDetails, setToolboxDetails] = useState<ToolboxDetail[]>(INITIAL_TOOLBOX_DETAILS as ToolboxDetail[]);
  const [editingToolboxId, setEditingToolboxId] = useState<string | null>(null);
  const [editingInventoryId, setEditingInventoryId] = useState<string | null>(null);

  const [newToolbox, setNewToolbox] = useState({ 
    idToolbox: '', 
    name: '', 
    nrp: '', 
    section: 'TRACK MECHANIC',
    badCount: 0,
    naCount: 0
  });
  const [newInventoryItem, setNewInventoryItem] = useState({ 
    toolId: '', 
    merk: '', 
    toolDesc: '', 
    typeSize: '', 
    qty: 0,
    condition: 'Good' as InspectionStatus
  });
  const [newDetailToolbox, setNewDetailToolbox] = useState<Omit<ToolboxDetail, 'id'>>({ merk: '', toolDesc: '', typeSize: '', qty: 1 });
  const [editingDetailId, setEditingDetailId] = useState<string | null>(null);

  const sortedLoans = useMemo(() => {
    return [...loans].sort((a, b) => {
      try {
        const timeA = parseISO(a.updatedAt || a.borrowDate).getTime();
        const timeB = parseISO(b.updatedAt || b.borrowDate).getTime();
        return timeB - timeA;
      } catch (e) {
        return 0;
      }
    });
  }, [loans]);

  const processedLoans = useMemo(() => {
    let list = sortedLoans;
    
    // Apply status filter
    if (loanStatusFilter !== 'all') {
      list = list.filter(loan => loan.status === loanStatusFilter);
    }

    // Apply section filter
    if (loanSectionFilter !== 'all') {
      list = list.filter(loan => loan.section === loanSectionFilter);
    }

    return list;
  }, [sortedLoans, loanStatusFilter, loanSectionFilter]);

  const processedOrders = useMemo(() => {
    let list = [...progressOrders];
    
    // Apply status filter
    if (orderStatusFilter !== 'all') {
      list = list.filter(order => order.status === orderStatusFilter);
    }

    // Apply sorting (by date desc)
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [progressOrders, orderStatusFilter]);

  const [newOrder, setNewOrder] = useState({
    date: new Date().toISOString().split('T')[0],
    merk: '',
    toolDesc: '',
    typeSize: '',
    qty: 0,
    vendor: '',
    pr: '',
    po: '',
    status: 'Progress',
    remarks: ''
  });

  useEffect(() => {
    // Clean up URL parameters like ?origin=...
    if (window.location.search) {
      const url = new URL(window.location.href);
      url.search = '';
      window.history.replaceState({}, document.title, url.pathname);
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubLoans = onSnapshot(collection(db, 'loans'), (snapshot) => {
      setLoans(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Loan)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'loans'));

    const unsubToolboxes = onSnapshot(collection(db, 'toolboxes'), (snapshot) => {
      setToolboxes(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Toolbox)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'toolboxes'));

    const unsubInventory = onSnapshot(collection(db, 'inventoryItems'), (snapshot) => {
      setInventoryItems(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as InventoryItem)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'inventoryItems'));

    const unsubMaintenance = onSnapshot(collection(db, 'maintenanceLogs'), (snapshot) => {
      setMaintenanceLogs(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as MaintenanceLog)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'maintenanceLogs'));

    const unsubOrders = onSnapshot(collection(db, 'orders'), (snapshot) => {
      setProgressOrders(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ProgressOrder)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'orders'));

    const unsubDaily = onSnapshot(collection(db, 'dailyInspections'), (snapshot) => {
      setDailyInspections(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as DailyInspection)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'dailyInspections'));

    const unsubToolroom = onSnapshot(collection(db, 'toolroomInspections'), (snapshot) => {
      setToolroomInspections(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ToolroomInspection)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'toolroomInspections'));

    return () => {
      unsubLoans();
      unsubToolboxes();
      unsubInventory();
      unsubMaintenance();
      unsubOrders();
      unsubDaily();
      unsubToolroom();
    };
  }, [user]);

  const seedData = async () => {
    if (!user) return;
    const batch = writeBatch(db);

    INITIAL_INVENTORY.forEach(item => {
      const ref = doc(collection(db, 'inventoryItems'));
      const { id, ...data } = item;
      batch.set(ref, data);
    });

    INITIAL_TOOLBOXES.forEach(tb => {
      const ref = doc(collection(db, 'toolboxes'));
      const { id, ...data } = tb;
      batch.set(ref, data);
    });

    try {
      await batch.commit();
      showToast("Data seeded successfully!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'batch_seed');
    }
  };

  const stats = useMemo(() => {
    const inventoryTotal = inventoryItems.reduce((acc, item) => acc + item.qty, 0);
    const toolboxesTotal = toolboxes.reduce((acc, tb) => acc + tb.toolCount, 0);
    
    // Condition counts for Inventory (Actual)
    const invStats = inventoryItems.reduce((acc, item) => {
      const inspections = toolroomInspections
        .filter(ins => ins.items.some(i => i.inventoryItemId === item.id))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      const lastStatus = inspections.length > 0 
        ? inspections[0].items.find(i => i.inventoryItemId === item.id)?.status 
        : item.condition; // Use initial condition if no inspection yet
      
      if (lastStatus === 'Bad') acc.bad += item.qty;
      else if (lastStatus === 'Broken') acc.broken += item.qty;
      else if (lastStatus === 'N/A') acc.na += item.qty;
      else acc.good += item.qty;
      
      return acc;
    }, { good: 0, bad: 0, broken: 0, na: 0 });

    // Condition counts for Toolboxes (Actual)
    const tbStats = toolboxes.reduce((acc, tb) => {
      const inspections = dailyInspections
        .filter(ins => ins.toolboxId === tb.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      const lastInspection = inspections[0];
      if (lastInspection) {
        lastInspection.items.forEach(item => {
          if (item.status === 'Bad') acc.bad++;
          else if (item.status === 'Broken') acc.broken++;
          else if (item.status === 'N/A') acc.na++;
          else acc.good++;
        });
      } else {
        // If no inspection, use initial counts
        acc.bad += (tb.badCount || 0);
        acc.broken += (tb.brokenCount || 0);
        acc.na += (tb.naCount || 0);
        acc.good += (tb.toolCount - (tb.badCount || 0) - (tb.brokenCount || 0) - (tb.naCount || 0));
      }
      return acc;
    }, { good: 0, bad: 0, broken: 0, na: 0 });

    const totalBad = invStats.bad + tbStats.bad;
    const totalBroken = invStats.broken + tbStats.broken;
    const totalNA = invStats.na + tbStats.na;
    const good = invStats.good + tbStats.good;
    const activeInventoryTotal = inventoryTotal - invStats.na;
    const activeToolboxesTotal = toolboxesTotal - tbStats.na;
    const total = activeInventoryTotal + activeToolboxesTotal;
    
    const borrowed = loans.filter(l => l.status === 'active').length;
    // N/A affects Available Toolroom
    const available = Math.max(0, activeInventoryTotal - borrowed);

    const chartData = [
      { name: 'Good', value: good, color: '#22c55e' },
      { name: 'Bad', value: totalBad, color: '#f59e0b' },
      { name: 'Broken', value: totalBroken, color: '#ef4444' },
      { name: 'N/A', value: totalNA, color: '#3b82f6' },
    ];

    const categoryData = inventoryItems
      .filter(item => item.condition !== 'N/A')
      .reduce((acc: any[], item) => {
        const existing = acc.find(i => i.name === item.merk);
        if (existing) {
          existing.value += item.qty;
        } else {
          acc.push({ name: item.merk, value: item.qty });
        }
        return acc;
      }, []);

    // Achievement Calculations
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Start of current week (Sunday)
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    // 1. Achievement Inspect Toolbox (Monthly Coverage)
    // Based on unique toolboxes inspected in the current month
    const monthlyDailyInspections = dailyInspections.filter(ins => {
      const d = new Date(ins.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    
    const uniqueToolboxesInspected = new Set(monthlyDailyInspections.map(ins => ins.toolboxId));
    const totalToolboxes = toolboxes.length;
    const dailyAchievement = totalToolboxes > 0 
      ? Math.min(Math.round((uniqueToolboxesInspected.size / totalToolboxes) * 100), 100) 
      : 0;

    // 2. Achievement Inspection Toolroom (Weekly Coverage)
    // Based on unique inventory items inspected in the current week
    const weeklyToolroomInspections = toolroomInspections.filter(ins => {
      const d = new Date(ins.date);
      return d >= startOfWeek;
    });
    
    const uniqueInventoryItemsInspected = new Set();
    weeklyToolroomInspections.forEach(ins => {
      ins.items.forEach(item => uniqueInventoryItemsInspected.add(item.inventoryItemId));
    });
    
    const totalInventoryItems = inventoryItems.length;
    const toolroomAchievement = totalInventoryItems > 0
      ? Math.min(Math.round((uniqueInventoryItemsInspected.size / totalInventoryItems) * 100), 100)
      : 0;

    // 3. Daily Monitoring Achievement (Last 7 Days)
    const dailyMonitoringData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      const dayDaily = dailyInspections.filter(ins => ins.date.startsWith(dateStr));
      const dayToolroom = toolroomInspections.filter(ins => ins.date.startsWith(dateStr));
      
      let goodCount = 0;
      let badCount = 0;
      let brokenCount = 0;
      let naCount = 0;

      dayDaily.forEach(ins => {
        ins.items.forEach(item => {
          if (item.status === 'Good') goodCount++;
          else if (item.status === 'Bad') badCount++;
          else if (item.status === 'Broken') brokenCount++;
          else if (item.status === 'N/A') naCount++;
        });
      });

      dayToolroom.forEach(ins => {
        ins.items.forEach(item => {
          if (item.status === 'Good') goodCount++;
          else if (item.status === 'Bad') badCount++;
          else if (item.status === 'Broken') brokenCount++;
          else if (item.status === 'N/A') naCount++;
        });
      });

      dailyMonitoringData.push({
        name: format(d, 'EEE'),
        Good: goodCount,
        Bad: badCount,
        Broken: brokenCount,
        'N/A': naCount
      });
    }

    const orderCount = progressOrders.filter(o => o.status !== 'Supply').length;
    const maintenanceCount = maintenanceLogs.length; // Assuming current logs are active or just counting them as requested

    return { 
      total, 
      good,
      inventoryTotal: activeInventoryTotal,
      toolboxesTotal: activeToolboxesTotal,
      available, 
      borrowed, 
      bad: totalBad, 
      broken: totalBroken,
      na: totalNA,
      maintenance: maintenanceCount, 
      orderCount,
      chartData, 
      categoryData,
      dailyAchievement,
      toolroomAchievement,
      dailyMonitoringData,
      totalMekanik: totalToolboxes,
      inspectedBulanIni: uniqueToolboxesInspected.size,
      totalAset: totalInventoryItems,
      inspectedMingguIni: uniqueInventoryItemsInspected.size
    };
  }, [inventoryItems, loans, dailyInspections, toolroomInspections, toolboxes, progressOrders, maintenanceLogs]);

  const toolboxesWithLastInspection = useMemo(() => {
    return toolboxes.map(tb => {
      const inspections = dailyInspections
        .filter(ins => ins.toolboxId === tb.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      const lastInspection = inspections[0];
      const badCount = lastInspection ? lastInspection.items.filter(i => i.status === 'Bad').length : 0;
      const brokenCount = lastInspection ? lastInspection.items.filter(i => i.status === 'Broken').length : 0;
      const naCount = lastInspection ? lastInspection.items.filter(i => i.status === 'N/A').length : 0;

      return {
        ...tb,
        lastInspectionDate: lastInspection ? lastInspection.date : undefined,
        badCount,
        brokenCount,
        naCount,
        latestItems: lastInspection ? lastInspection.items : []
      };
    }).sort((a, b) => a.idToolbox.localeCompare(b.idToolbox, undefined, { numeric: true, sensitivity: 'base' }));
  }, [toolboxes, dailyInspections]);

  const [showDamagedInventory, setShowDamagedInventory] = useState(false);
  const [showDamagedDetails, setShowDamagedDetails] = useState(true);

  const inventoryWithLastInspection = useMemo(() => {
    return inventoryItems.map(item => {
      const inspections = toolroomInspections
        .filter(ins => ins.items.some(i => i.inventoryItemId === item.id))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      const lastInspectionItem = inspections.length > 0 
        ? inspections[0].items.find(i => i.inventoryItemId === item.id)
        : null;

      return {
        ...item,
        lastInspectionDate: inspections.length > 0 ? inspections[0].date : undefined,
        lastStatus: lastInspectionItem?.status || 'Good',
        lastNotes: lastInspectionItem?.notes || ''
      };
    }).sort((a, b) => a.toolId.localeCompare(b.toolId, undefined, { numeric: true, sensitivity: 'base' }));
  }, [inventoryItems, toolroomInspections]);

  const toolboxDetailsWithLastInspection = useMemo(() => {
    return toolboxDetails.map(detail => {
      // Find all inspections that include this item
      const inspections = dailyInspections
        .filter(ins => ins.items.some(i => i.toolDetailId === detail.id))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      const lastInspectionItem = inspections.length > 0 
        ? inspections[0].items.find(i => i.toolDetailId === detail.id)
        : null;

      return {
        ...detail,
        lastStatus: lastInspectionItem?.status || 'Good',
        lastNotes: lastInspectionItem?.notes || ''
      };
    }).sort((a, b) => {
      const comparison = a.toolDesc.localeCompare(b.toolDesc, undefined, { sensitivity: 'base' });
      return toolboxDetailsSortOrder === 'asc' ? comparison : -comparison;
    });
  }, [toolboxDetails, dailyInspections, selectedToolboxId, toolboxDetailsSortOrder]);

  const handleAddLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const loanData = {
      toolName: newLoan.toolName || '',
      typeSize: newLoan.typeSize || '',
      borrowerName: newLoan.borrowerName || 'Unknown',
      section: newLoan.section || 'Track',
      shift: (newLoan.shift as 'Day' | 'Night') || 'Day',
      borrowDate: newLoan.borrowDate || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: newLoan.status || 'active',
    };

    try {
      if (editingLoanId) {
        await updateDoc(doc(db, 'loans', editingLoanId), loanData);
        setEditingLoanId(null);
      } else {
        await addDoc(collection(db, 'loans'), loanData);
      }
      setIsAddLoanModalOpen(false);
      setNewLoan({
        status: 'active',
        section: 'Track',
        shift: 'Day',
        toolName: '',
        typeSize: '',
        borrowerName: '',
        borrowDate: ''
      });
      setSuccessDialog({
        isOpen: true,
        title: 'Success',
        message: editingLoanId ? 'Loan data has been updated successfully!' : 'Loan data has been saved successfully!',
        onConfirm: () => {}
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'loans');
    }
  };

  const handleEditLoan = (loan: Loan) => {
    setNewLoan(loan);
    setEditingLoanId(loan.id);
    setIsAddLoanModalOpen(true);
  };

  const handleDeleteLoan = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Loan Data',
      message: 'Are you sure you want to delete this loan record? This action cannot be undone.',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'loans', id));
          showToast("Loan record deleted successfully!");
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'loans');
        }
      }
    });
  };

  const handleAddMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    const logData = {
      toolName: newMaintenanceLog.toolName || '',
      date: newMaintenanceLog.date || new Date().toISOString().split('T')[0],
      description: newMaintenanceLog.description || '',
      cost: Number(newMaintenanceLog.cost) || 0,
      technician: newMaintenanceLog.technician || '',
    };

    try {
      if (editingMaintenanceId) {
        await updateDoc(doc(db, 'maintenanceLogs', editingMaintenanceId), logData);
        setEditingMaintenanceId(null);
      } else {
        await addDoc(collection(db, 'maintenanceLogs'), logData);
      }
      setIsAddMaintenanceModalOpen(false);
      setNewMaintenanceLog({
        date: new Date().toISOString().split('T')[0],
        toolName: '',
        description: '',
        cost: 0,
        technician: ''
      });
      setSuccessDialog({
        isOpen: true,
        title: 'Success',
        message: editingMaintenanceId ? 'Maintenance log updated successfully!' : 'Maintenance log added successfully!',
        onConfirm: () => {}
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'maintenanceLogs');
    }
  };

  const handleEditMaintenance = (log: MaintenanceLog) => {
    setNewMaintenanceLog(log);
    setEditingMaintenanceId(log.id);
    setIsAddMaintenanceModalOpen(true);
  };

  const handleDeleteMaintenance = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Maintenance Log',
      message: 'Are you sure you want to delete this maintenance log?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'maintenanceLogs', id));
          showToast("Maintenance log deleted!");
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'maintenanceLogs');
        }
      }
    });
  };

  const handleReturnTool = async (loanId: string) => {
    const loan = loans.find(l => l.id === loanId);
    if (!loan || loan.status === 'returned') return;

    try {
      await updateDoc(doc(db, 'loans', loanId), {
        status: 'returned',
        returnDate: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Update inventory quantity if toolId exists
      if (loan.toolId) {
        const item = inventoryItems.find(i => i.id === loan.toolId);
        if (item) {
          await updateDoc(doc(db, 'inventoryItems', item.id), {
            qty: item.qty + 1
          });
        }
      }
      setSuccessDialog({
        isOpen: true,
        title: 'Success',
        message: 'Tool has been returned successfully!',
        onConfirm: () => {}
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'loans/return');
    }
  };

  const handleReactivateLoan = async (loanId: string) => {
    const loan = loans.find(l => l.id === loanId);
    if (!loan || loan.status === 'active') return;

    setConfirmDialog({
      isOpen: true,
      title: 'Re-activate Loan',
      message: 'Are you sure you want to change this loan status back to Active? This will reduce the quantity in inventory if applicable.',
      onConfirm: async () => {
        try {
          // Update loan status
          await updateDoc(doc(db, 'loans', loanId), {
            status: 'active',
            returnDate: null,
            updatedAt: new Date().toISOString()
          });

          // Update inventory quantity if toolId exists
          if (loan.toolId) {
            const item = inventoryItems.find(i => i.id === loan.toolId);
            if (item && item.qty > 0) {
              await updateDoc(doc(db, 'inventoryItems', item.id), {
                qty: item.qty - 1
              });
            }
          }
          
          showToast("Loan re-activated successfully!");
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'loans/reactivate');
        }
      }
    });
  };

  const handleAddToolbox = async (e: React.FormEvent) => {
    e.preventDefault();
    const toolboxData = {
      idToolbox: newToolbox.idToolbox,
      name: newToolbox.name,
      nrp: newToolbox.nrp,
      section: newToolbox.section,
      toolCount: toolboxDetails.length,
      badCount: newToolbox.badCount,
      naCount: newToolbox.naCount
    };

    try {
      if (editingToolboxId) {
        await updateDoc(doc(db, 'toolboxes', editingToolboxId), toolboxData);
        setEditingToolboxId(null);
      } else {
        await addDoc(collection(db, 'toolboxes'), toolboxData);
      }
      setIsAddToolboxModalOpen(false);
      setNewToolbox({ 
        idToolbox: '', 
        name: '', 
        nrp: '', 
        section: 'TRACK MECHANIC',
        badCount: 0,
        naCount: 0
      });
      setSuccessDialog({
        isOpen: true,
        title: 'Success',
        message: editingToolboxId ? 'Toolbox updated successfully!' : 'Toolbox added successfully!',
        onConfirm: () => {}
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'toolboxes');
    }
  };

  const handleEditToolbox = (toolbox: Toolbox) => {
    setNewToolbox({
      idToolbox: toolbox.idToolbox,
      name: toolbox.name,
      nrp: toolbox.nrp,
      section: toolbox.section,
      badCount: toolbox.badCount || 0,
      naCount: toolbox.naCount || 0
    });
    setEditingToolboxId(toolbox.id);
    setIsAddToolboxModalOpen(true);
  };

  const handleDeleteToolbox = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Toolbox',
      message: 'Are you sure you want to delete this toolbox?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'toolboxes', id));
          showToast("Toolbox deleted!");
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'toolboxes');
        }
      }
    });
  };

  const handleAddInventoryItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const itemData = {
      ...newInventoryItem
    };

    try {
      if (editingInventoryId) {
        await updateDoc(doc(db, 'inventoryItems', editingInventoryId), itemData);
        setEditingInventoryId(null);
      } else {
        await addDoc(collection(db, 'inventoryItems'), itemData);
      }
      setIsAddInventoryModalOpen(false);
      setNewInventoryItem({ 
        toolId: '', 
        merk: '', 
        toolDesc: '', 
        typeSize: '', 
        qty: 0,
        condition: 'Good'
      });
      setSuccessDialog({
        isOpen: true,
        title: 'Success',
        message: editingInventoryId ? 'Inventory updated successfully!' : 'Inventory added successfully!',
        onConfirm: () => {}
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventoryItems');
    }
  };

  const handleEditInventoryItem = (item: any) => {
    setNewInventoryItem({
      toolId: item.toolId,
      merk: item.merk,
      toolDesc: item.toolDesc,
      typeSize: item.typeSize,
      qty: item.qty,
      condition: item.condition || 'Good'
    });
    setEditingInventoryId(item.id);
    setIsAddInventoryModalOpen(true);
  };

  const handleDeleteInventoryItem = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Inventory Item',
      message: 'Are you sure you want to delete this inventory item?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'inventoryItems', id));
          showToast("Inventory item deleted!");
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'inventoryItems');
        }
      }
    });
  };

  const handleAddDetailToolbox = async (e: React.FormEvent) => {
    e.preventDefault();
    // Toolbox details are currently local state but should probably be linked to a toolbox in Firestore
    // For now, let's keep them local or move to a subcollection if needed.
    // Given the complexity, I'll keep them local for now but update the others.
    if (editingDetailId) {
      setToolboxDetails(toolboxDetails.map(detail => 
        detail.id === editingDetailId ? { ...newDetailToolbox, id: editingDetailId } : detail
      ));
      setEditingDetailId(null);
    } else {
      const detail = {
        id: `DT${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
        ...newDetailToolbox
      };
      setToolboxDetails([...toolboxDetails, detail]);
    }
    
    setIsAddDetailToolboxModalOpen(false);
    setNewDetailToolbox({ merk: '', toolDesc: '', typeSize: '', qty: 1 });
    setSuccessDialog({
      isOpen: true,
      title: 'Success',
      message: editingDetailId ? 'Detail updated successfully!' : 'Detail added successfully!',
      onConfirm: () => {}
    });
  };

  const handleEditDetailToolbox = (detail: ToolboxDetail) => {
    setNewDetailToolbox({
      merk: detail.merk,
      toolDesc: detail.toolDesc,
      typeSize: detail.typeSize,
      qty: detail.qty
    });
    setEditingDetailId(detail.id);
    setIsAddDetailToolboxModalOpen(true);
  };

  const handleDeleteDetailToolbox = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Tool Detail',
      message: 'Are you sure you want to delete this tool detail?',
      onConfirm: () => {
        setToolboxDetails(toolboxDetails.filter(d => d.id !== id));
        showToast("Detail deleted!");
      }
    });
  };

  const handleAddOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const orderData = {
      ...newOrder
    };

    try {
      if (editingOrderId) {
        await updateDoc(doc(db, 'orders', editingOrderId), orderData);
        setEditingOrderId(null);
      } else {
        await addDoc(collection(db, 'orders'), orderData);
      }
      setIsAddOrderModalOpen(false);
      setNewOrder({
        date: new Date().toISOString().split('T')[0],
        merk: '',
        toolDesc: '',
        typeSize: '',
        qty: 0,
        vendor: '',
        pr: '',
        po: '',
        status: 'Progress',
        remarks: ''
      });
      setSuccessDialog({
        isOpen: true,
        title: 'Success',
        message: editingOrderId ? 'Order updated successfully!' : 'Order added successfully!',
        onConfirm: () => {}
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'orders');
    }
  };

  const handleEditOrder = (order: any) => {
    setNewOrder({
      date: order.date,
      merk: order.merk,
      toolDesc: order.toolDesc,
      typeSize: order.typeSize,
      qty: order.qty,
      vendor: order.vendor,
      pr: order.pr,
      po: order.po,
      status: order.status,
      remarks: order.remarks
    });
    setEditingOrderId(order.id);
    setIsAddOrderModalOpen(true);
  };

  const handleDeleteOrder = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Order',
      message: 'Are you sure you want to delete this order?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'orders', id));
          showToast("Order deleted!");
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'orders');
        }
      }
    });
  };

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    // 1. Master Inventory
    const inventoryData = inventoryWithLastInspection.map(i => ({
      'ID': i.id,
      'Tool ID': i.toolId,
      'Merk': i.merk,
      'Description': i.toolDesc,
      'Type/Size': i.typeSize,
      'Qty': i.qty
    }));
    const inventoryWS = XLSX.utils.json_to_sheet(inventoryData);
    XLSX.utils.book_append_sheet(wb, inventoryWS, "Master Inventory");

    // 2. Master Toolboxes
    const toolboxesData = toolboxesWithLastInspection.map(t => ({
      'ID': t.id,
      'Toolbox ID': t.idToolbox,
      'Name': t.name,
      'NRP': t.nrp,
      'Section': t.section,
      'Tool Count': t.toolCount
    }));
    const toolboxesWS = XLSX.utils.json_to_sheet(toolboxesData);
    XLSX.utils.book_append_sheet(wb, toolboxesWS, "Master Toolboxes");

    // 3. Detail Toolbox
    const toolboxDetailsData = toolboxDetails.map(d => ({
      'ID': d.id,
      'Merk': d.merk,
      'Description': d.toolDesc,
      'Type/Size': d.typeSize,
      'Qty': d.qty
    }));
    const toolboxDetailsWS = XLSX.utils.json_to_sheet(toolboxDetailsData);
    XLSX.utils.book_append_sheet(wb, toolboxDetailsWS, "Detail Toolbox");

    // 4. Order Tool
    const ordersData = progressOrders.map(o => ({
      'ID': o.id,
      'Date': o.date,
      'Merk': o.merk,
      'Description': o.toolDesc,
      'Type/Size': o.typeSize,
      'Qty': o.qty,
      'Vendor': o.vendor,
      'PR': o.pr,
      'PO': o.po,
      'Status': o.status,
      'Remarks': o.remarks
    }));
    const ordersWS = XLSX.utils.json_to_sheet(ordersData);
    XLSX.utils.book_append_sheet(wb, ordersWS, "Order Tool");

    // 5. Loans
    const loansData = loans.map(l => ({
      'ID': l.id,
      'Tool Name': l.toolName,
      'Type/Size': l.typeSize,
      'Borrower': l.borrowerName,
      'Section': l.section,
      'Shift': l.shift,
      'Date': l.borrowDate,
      'Return Date': l.returnDate || '-',
      'Status': l.status
    }));
    const loansWS = XLSX.utils.json_to_sheet(loansData);
    XLSX.utils.book_append_sheet(wb, loansWS, "Loans");

    // 6. Maintenance
    const maintenanceData = maintenanceLogs.map(m => ({
      'ID': m.id,
      'Tool Name': m.toolName,
      'Date': m.date,
      'Technician': m.technician,
      'Cost': m.cost,
      'Description': m.description
    }));
    const maintenanceWS = XLSX.utils.json_to_sheet(maintenanceData);
    XLSX.utils.book_append_sheet(wb, maintenanceWS, "Maintenance");

    // 7. Daily Inspection
    const dailyData = dailyInspections.flatMap(ins => 
      ins.items.map(item => ({
        'Inspection ID': ins.id,
        'Date': ins.date,
        'Toolbox ID': ins.toolboxId,
        'Inspector': ins.inspector,
        'Tool Detail ID': item.toolDetailId,
        'Status': item.status,
        'Notes': item.notes || ''
      }))
    );
    const dailyWS = XLSX.utils.json_to_sheet(dailyData);
    XLSX.utils.book_append_sheet(wb, dailyWS, "Daily Inspection");

    // 8. Toolroom Inspection
    const toolroomData = toolroomInspections.flatMap(ins => 
      ins.items.map(item => ({
        'Inspection ID': ins.id,
        'Date': ins.date,
        'Inspector': ins.inspector,
        'Inventory Item ID': item.inventoryItemId,
        'Status': item.status,
        'Notes': item.notes || ''
      }))
    );
    const toolroomWS = XLSX.utils.json_to_sheet(toolroomData);
    XLSX.utils.book_append_sheet(wb, toolroomWS, "Toolroom Inspection");

    XLSX.writeFile(wb, `Tool_Management_System_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleSaveDailyInspection = async () => {
    if (!selectedToolboxId || !user) return;
    const newInspection = {
      date: new Date().toISOString(),
      toolboxId: selectedToolboxId,
      inspector: user.displayName || user.email || 'Admin User',
      items: toolboxDetails
        .map(d => ({
          toolDetailId: d.id,
          status: inspectionResults[d.id] || 'Good',
          notes: inspectionNotes[d.id] || ''
        }))
    };
    try {
      await addDoc(collection(db, 'dailyInspections'), newInspection);
      setInspectionResults({});
      setInspectionNotes({});
      setSelectedToolboxId('');
      setSuccessDialog({
        isOpen: true,
        title: 'Success',
        message: 'Daily Inspection saved successfully!',
        onConfirm: () => setActiveTab('dashboard')
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'dailyInspections');
    }
  };

  const generateToolboxPdf = (toolboxId: string, results: Record<string, InspectionStatus>, date?: string) => {
    const toolbox = toolboxes.find(tb => tb.id === toolboxId);
    if (!toolbox) return;

    const doc = new jsPDF();
    const dateStr = date ? format(parseISO(date), 'dd MMM yyyy HH:mm') : format(new Date(), 'dd MMM yyyy HH:mm');

    // Header (Kop Surat)
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text('PT HASNUR RIUNG SINERGI', 105, 15, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text('SITE PT ANTANG GUNUNG MERATUS', 105, 22, { align: 'center' });
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text('Tool Inspection Report', 105, 32, { align: 'center' });
    
    doc.setLineWidth(0.5);
    doc.line(14, 35, 196, 35);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50);

    doc.text(`Toolbox: ${toolbox.idToolbox} - ${toolbox.name}`, 14, 45);
    doc.text(`Section: ${toolbox.section}`, 14, 51);
    doc.text(`Inspector: Admin User`, 14, 57);
    doc.text(`Date: ${dateStr}`, 14, 63);

    const tableData = toolboxDetails.map(detail => {
      const status = results[detail.id] || 'Good';
      return [
        detail.merk,
        detail.toolDesc,
        detail.typeSize,
        detail.qty,
        status
      ];
    });

    autoTable(doc, {
      startY: 70,
      head: [['Merk', 'Tool Description', 'PN/Type/Size', 'Qty', 'Status']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] },
      margin: { bottom: 60 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const status = data.cell.raw;
          if (status === 'Bad') data.cell.styles.textColor = [245, 158, 11];
          if (status === 'Broken') data.cell.styles.textColor = [239, 68, 68];
          if (status === 'N/A') data.cell.styles.textColor = [59, 130, 246];
          if (status === 'Good') data.cell.styles.textColor = [34, 197, 94];
        }
      }
    });

    // Footer Signature
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text('Disetujui Oleh,', pageWidth - 60, pageHeight - 45);
    doc.text('(...........................)', pageWidth - 60, pageHeight - 15);
    doc.text('Sect./GL Planner', pageWidth - 60, pageHeight - 10);

    doc.save(`Daily_Inspection_${toolbox.idToolbox}_${new Date().getTime()}.pdf`);
  };

  const generateInventoryPdf = (results: Record<string, InspectionStatus>, date?: string) => {
    const doc = new jsPDF();
    const dateStr = date ? format(parseISO(date), 'dd MMM yyyy HH:mm') : format(new Date(), 'dd MMM yyyy HH:mm');

    // Header (Kop Surat)
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text('PT HASNUR RIUNG SINERGI', 105, 15, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text('SITE PT ANTANG GUNUNG MERATUS', 105, 22, { align: 'center' });
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text('Master Data Inventory Inspection Report', 105, 32, { align: 'center' });
    
    doc.setLineWidth(0.5);
    doc.line(14, 35, 196, 35);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50);

    doc.text(`Inspector: Admin User`, 14, 45);
    doc.text(`Date: ${dateStr}`, 14, 51);

    const tableData = inventoryWithLastInspection.map(i => {
      const status = results[i.id] || 'Good';
      return [
        i.toolId,
        i.merk,
        i.toolDesc,
        i.typeSize,
        i.qty,
        status
      ];
    });

    autoTable(doc, {
      startY: 60,
      head: [['Tool ID', 'Merk', 'Tool Description', 'PN/Type/Size', 'Qty', 'Status']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] },
      margin: { bottom: 60 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 5) {
          const status = data.cell.raw;
          if (status === 'Bad') data.cell.styles.textColor = [245, 158, 11];
          if (status === 'Broken') data.cell.styles.textColor = [239, 68, 68];
          if (status === 'N/A') data.cell.styles.textColor = [59, 130, 246];
          if (status === 'Good') data.cell.styles.textColor = [34, 197, 94];
        }
      }
    });

    // Footer Signature
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text('Disetujui Oleh,', pageWidth - 60, pageHeight - 45);
    doc.text('(...........................)', pageWidth - 60, pageHeight - 15);
    doc.text('Sect./GL Planner', pageWidth - 60, pageHeight - 10);

    doc.save(`Toolroom_Inspection_${new Date().getTime()}.pdf`);
  };

  const handlePrintDailyPDF = () => {
    if (!selectedToolboxId) return;
    generateToolboxPdf(selectedToolboxId, inspectionResults);
  };

  const handleSaveToolroomInspection = async () => {
    if (!user) return;
    const newInspection = {
      date: new Date().toISOString(),
      inspector: user.displayName || user.email || 'Admin User',
      items: inventoryWithLastInspection.map(i => ({
        inventoryItemId: i.id,
        status: inspectionResults[i.id] || 'Good',
        notes: inspectionNotes[i.id] || ''
      }))
    };
    try {
      await addDoc(collection(db, 'toolroomInspections'), newInspection);
      setInspectionResults({});
      setInspectionNotes({});
      setSuccessDialog({
        isOpen: true,
        title: 'Success',
        message: 'Toolroom Inspection saved successfully!',
        onConfirm: () => setActiveTab('dashboard')
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'toolroomInspections');
    }
  };

  const handlePrintToolroomPDF = () => {
    generateInventoryPdf(inspectionResults);
  };

  const handleNavClick = (tab: Tab) => {
    setActiveTab(tab);
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast.show && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className="fixed bottom-8 left-1/2 z-[200] px-6 py-3 bg-slate-900 text-white rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-800"
          >
            <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-sm">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar Backdrop for Mobile */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 bg-slate-900 text-slate-300 transition-all duration-300 ease-in-out lg:static lg:translate-x-0",
        isSidebarOpen ? "w-64 translate-x-0" : "w-20 -translate-x-full lg:translate-x-0"
      )}>
        <div className="h-full flex flex-col">
          <div className="p-6 flex items-center gap-3">
            <div className="relative w-10 h-10 flex items-center justify-center">
              <div className="absolute inset-0 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                <Settings className="w-8 h-8 animate-[spin_10s_linear_infinite]" />
              </div>
              <div className="relative z-10 text-white">
                <Wrench className="w-5 h-5" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-orange-500 rounded-sm rotate-45 border-2 border-slate-900" />
            </div>
            {isSidebarOpen && (
              <div className="flex flex-col">
                <h1 className="text-sm font-black text-white leading-none tracking-tighter uppercase">Tool Management</h1>
                <h1 className="text-xs font-bold text-orange-500 leading-none mt-1 uppercase tracking-widest">System</h1>
              </div>
            )}
          </div>

          <nav className="flex-1 px-4 space-y-2 mt-4">
            <NavItem key="dashboard" icon={<LayoutDashboard className="w-5 h-5" />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => handleNavClick('dashboard')} collapsed={!isSidebarOpen} />
            
            <div className="pt-2">
              <button 
                onClick={() => setIsInspectionOpen(!isInspectionOpen)}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-xl transition-all duration-200 text-slate-400 hover:bg-slate-800 hover:text-slate-200",
                  !isSidebarOpen && "justify-center px-0"
                )}
              >
                <div className="flex items-center gap-3">
                  <ClipboardCheck className="w-5 h-5" />
                  {isSidebarOpen && <span className="font-medium text-sm">Inspection</span>}
                </div>
                {isSidebarOpen && (isInspectionOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
              </button>
              
              <AnimatePresence>
                {isInspectionOpen && isSidebarOpen && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden pl-4 space-y-1 mt-1"
                  >
                    <NavItem key="inspection-daily" icon={<Calendar className="w-4 h-4" />} label="Daily Inspection" active={activeTab === 'inspection-daily'} onClick={() => handleNavClick('inspection-daily')} collapsed={false} />
                    <NavItem key="inspection-toolroom" icon={<Package className="w-4 h-4" />} label="Inspection Toolroom" active={activeTab === 'inspection-toolroom'} onClick={() => handleNavClick('inspection-toolroom')} collapsed={false} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <NavItem key="loans" icon={<ArrowRightLeft className="w-5 h-5" />} label="Recent Loans" active={activeTab === 'loans'} onClick={() => handleNavClick('loans')} collapsed={!isSidebarOpen} />
            <NavItem key="progress-order" icon={<ShoppingCart className="w-5 h-5" />} label="Order Tool" active={activeTab === 'progress-order'} onClick={() => handleNavClick('progress-order')} collapsed={!isSidebarOpen} />
            <NavItem key="maintenance" icon={<ShieldCheck className="w-5 h-5" />} label="Maintenance" active={activeTab === 'maintenance'} onClick={() => handleNavClick('maintenance')} collapsed={!isSidebarOpen} />
            
            <div className="pt-2">
              <button 
                onClick={() => setIsMasterDataOpen(!isMasterDataOpen)}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-xl transition-all duration-200 text-slate-400 hover:bg-slate-800 hover:text-slate-200",
                  !isSidebarOpen && "justify-center px-0"
                )}
              >
                <div className="flex items-center gap-3">
                  <Database className="w-5 h-5" />
                  {isSidebarOpen && <span className="font-medium text-sm">Master Data</span>}
                </div>
                {isSidebarOpen && (isMasterDataOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
              </button>
              
              <AnimatePresence>
                {isMasterDataOpen && isSidebarOpen && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden pl-4 space-y-1 mt-1"
                  >
                    <NavItem key="master-toolbox" icon={<Briefcase className="w-4 h-4" />} label="Master Toolbox" active={activeTab === 'master-toolbox'} onClick={() => handleNavClick('master-toolbox')} collapsed={false} />
                    <NavItem key="master-inventory" icon={<ClipboardList className="w-4 h-4" />} label="Master Inventory" active={activeTab === 'master-inventory'} onClick={() => handleNavClick('master-inventory')} collapsed={false} />
                    <NavItem key="master-detail-toolbox" icon={<Layers className="w-4 h-4" />} label="Detail Toolbox" active={activeTab === 'master-detail-toolbox'} onClick={() => handleNavClick('master-detail-toolbox')} collapsed={false} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-800">
              <NavItem key="nav-settings" icon={<Settings className="w-5 h-5" />} label="Setting" active={activeTab === 'settings'} onClick={() => handleNavClick('settings')} collapsed={!isSidebarOpen} />
            </div>
          </nav>

          <div className="p-4 border-t border-slate-800">
            {user ? (
              <div className={cn("flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer group", !isSidebarOpen && "justify-center")}>
                <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center overflow-hidden">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName || ''} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <User className="w-4 h-4 text-white" />
                  )}
                </div>
                {isSidebarOpen && (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{user.displayName || 'User'}</p>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  </div>
                )}
                {isSidebarOpen && (
                  <button onClick={logout} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors">
                    <LogOut className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <button 
                onClick={signInWithGoogle}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-all font-bold text-sm",
                  !isSidebarOpen && "justify-center"
                )}
              >
                <User className="w-5 h-5" />
                {isSidebarOpen && <span>Login with Google</span>}
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-40">
          <div className="flex items-center gap-2 lg:gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"><Menu className="w-5 h-5" /></button>
            <h2 className="text-base lg:text-lg font-semibold text-slate-800 capitalize truncate max-w-[150px] sm:max-w-none">{activeTab === 'loans' ? 'Recent Loans' : activeTab.replace(/-/g, ' ')}</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-full border border-slate-100">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-medium text-slate-600">System Online</span>
            </div>
            <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg relative">
              <AlertCircle className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {!user ? (
              <div className="flex flex-col items-center justify-center min-h-[70vh] text-center space-y-8">
                <div className="w-24 h-24 bg-indigo-100 rounded-3xl flex items-center justify-center text-indigo-600 shadow-inner">
                  <ShieldCheck className="w-12 h-12" />
                </div>
                <div className="space-y-3">
                  <h2 className="text-3xl font-bold text-slate-900">Tool Management System</h2>
                  <p className="text-slate-500 max-w-md mx-auto">Sistem manajemen inventaris, peminjaman, dan inspeksi tool terintegrasi.</p>
                </div>

                <div className="w-full max-w-md bg-white p-8 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 space-y-6">
                  <div className="flex p-1 bg-slate-100 rounded-2xl">
                    <button 
                      onClick={() => setIsIdLogin(false)}
                      className={cn(
                        "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all",
                        !isIdLogin ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      Google Login
                    </button>
                    <button 
                      onClick={() => setIsIdLogin(true)}
                      className={cn(
                        "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all",
                        isIdLogin ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      ID Login
                    </button>
                  </div>

                  {isIdLogin ? (
                    <form onSubmit={handleIdLogin} className="space-y-4 text-left">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">User ID</label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input 
                            type="text"
                            required
                            placeholder="Enter your ID"
                            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            value={loginId}
                            onChange={e => setLoginId(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Password</label>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input 
                            type="password"
                            required
                            placeholder="••••••••"
                            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            value={loginPassword}
                            onChange={e => setLoginPassword(e.target.value)}
                          />
                        </div>
                      </div>
                      <button 
                        type="submit"
                        className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
                      >
                        <Key className="w-5 h-5" /> Sign In
                      </button>
                    </form>
                  ) : (
                    <div className="space-y-4">
                      <button 
                        onClick={signInWithGoogle}
                        className="w-full flex items-center justify-center gap-3 px-8 py-4 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold hover:bg-slate-50 transition-all shadow-sm"
                      >
                        <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" referrerPolicy="no-referrer" />
                        Continue with Google
                      </button>
                      <p className="text-xs text-slate-400">Gunakan akun Google perusahaan untuk akses superadmin.</p>
                    </div>
                  )}
                </div>
              </div>
            ) :
 !isAuthReady ? (
              <div className="flex items-center justify-center min-h-[60vh]">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <AnimatePresence mode="wait">
              <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                {activeTab === 'dashboard' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <AchievementCard 
                        title="INSPEKSI DAILY TOOLBOX" 
                        subtitle="Progres inspeksi mekanik bulan berjalan"
                        value={stats.dailyAchievement} 
                        totalLabel="TOTAL MEKANIK"
                        totalValue={stats.totalMekanik}
                        currentLabel="BULAN INI"
                        currentValue={stats.inspectedBulanIni}
                        icon={<Briefcase className="w-24 h-24" />}
                        color="bg-indigo-600"
                      />
                      <AchievementCard 
                        title="INSPEKSI ASET TOOLROOM" 
                        subtitle="Progres validasi aset toolroom minggu berjalan"
                        value={stats.toolroomAchievement} 
                        totalLabel="TOTAL ASET"
                        totalValue={stats.totalAset}
                        currentLabel="MINGGU INI"
                        currentValue={stats.inspectedMingguIni}
                        icon={<Package className="w-24 h-24" />}
                        color="bg-emerald-600"
                      />
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <StatCard 
                        key="stat-good"
                        title="GOOD" 
                        value={stats.good} 
                        subtitle="Kondisi Aman"
                        accentColor="border-l-green-500"
                        badgeColor="bg-green-50"
                        textColor="text-green-600"
                      />
                      <StatCard 
                        key="stat-bad"
                        title="BAD" 
                        value={stats.bad} 
                        subtitle="Butuh Perbaikan"
                        accentColor="border-l-yellow-500"
                        badgeColor="bg-yellow-50"
                        textColor="text-yellow-600"
                      />
                      <StatCard 
                        key="stat-broken"
                        title="BROKEN" 
                        value={stats.broken} 
                        subtitle="Tidak Layak"
                        accentColor="border-l-red-500"
                        badgeColor="bg-red-50"
                        textColor="text-red-600"
                      />
                      <StatCard 
                        key="stat-na"
                        title="N/A" 
                        value={stats.na} 
                        subtitle="Tidak Ada"
                        accentColor="border-l-blue-500"
                        badgeColor="bg-blue-50"
                        textColor="text-blue-600"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <StatCard 
                        key="stat-order"
                        title="ORDER TOOL" 
                        value={stats.orderCount} 
                        subtitle="Sedang Dipesan"
                        accentColor="border-l-indigo-500"
                        badgeColor="bg-indigo-50"
                        textColor="text-indigo-600"
                      />
                      <StatCard 
                        key="stat-maint"
                        title="MAINTENANCE" 
                        value={stats.maintenance} 
                        subtitle="Under Maintenance"
                        accentColor="border-l-purple-500"
                        badgeColor="bg-purple-50"
                        textColor="text-purple-600"
                      />
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-slate-800">Quick Actions</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <button 
                          key="qa-daily-inspect"
                          onClick={() => setActiveTab('inspection-daily')}
                          className="w-full p-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md hover:border-indigo-200 transition-all group text-left"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                              <Calendar className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-800 text-sm">Daily Inspect</p>
                              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Toolbox</p>
                            </div>
                          </div>
                        </button>
                        <button 
                          key="qa-toolroom-inspect"
                          onClick={() => setActiveTab('inspection-toolroom')}
                          className="w-full p-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md hover:border-emerald-200 transition-all group text-left"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                              <Package className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-800 text-sm">Toolroom Inspect</p>
                              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Inventory</p>
                            </div>
                          </div>
                        </button>
                        <button 
                          key="qa-add-loan"
                          onClick={() => {
                            setActiveTab('loans');
                            setEditingLoanId(null);
                            setNewLoan({
                              status: 'active',
                              section: 'Track',
                              shift: 'Day',
                              toolName: '',
                              typeSize: '',
                              borrowerName: '',
                              borrowDate: new Date().toISOString()
                            });
                            setIsAddLoanModalOpen(true);
                          }}
                          className="w-full p-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md hover:border-blue-200 transition-all group text-left"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                              <Plus className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-800 text-sm">Add Loan</p>
                              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Borrow Tool</p>
                            </div>
                          </div>
                        </button>
                        <button 
                          key="qa-add-order"
                          onClick={() => {
                            setActiveTab('progress-order');
                            setIsAddOrderModalOpen(true);
                          }}
                          className="w-full p-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md hover:border-amber-200 transition-all group text-left"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                              <ShoppingCart className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-800 text-sm">Add Order</p>
                              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Purchase Request</p>
                            </div>
                          </div>
                        </button>
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-6 border-b border-slate-100">
                        <h3 className="text-lg font-semibold text-slate-800">Recent Active Loans</h3>
                      </div>
                      
                      {/* Desktop View */}
                      <div className="hidden lg:block overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                            <tr>
                              <th className="px-6 py-3 font-semibold">Tool</th>
                              <th className="px-6 py-3 font-semibold">Borrower</th>
                              <th className="px-6 py-3 font-semibold">Section</th>
                              <th className="px-6 py-3 font-semibold">Shift</th>
                              <th className="px-6 py-3 font-semibold">Date</th>
                              <th className="px-6 py-3 font-semibold text-center">Status</th>
                              <th className="px-6 py-3 font-semibold text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                        {sortedLoans.filter(l => l.status === 'active').slice(0, 5).map((loan, idx) => (
                              <tr key={`loan-dash-dt-${loan.id}-${idx}`} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4">
                                  <div className="font-medium text-slate-700">{loan.toolName}</div>
                                  <div className="text-xs text-slate-400">{loan.typeSize}</div>
                                </td>
                                <td className="px-6 py-4 text-slate-600">{loan.borrowerName}</td>
                                <td className="px-6 py-4 text-slate-500 text-sm">{loan.section}</td>
                                <td className="px-6 py-4 text-slate-500 text-sm">{loan.shift}</td>
                                <td className="px-6 py-4 text-slate-500 text-sm">{format(parseISO(loan.borrowDate), 'MMM dd, HH:mm')}</td>
                                <td className="px-6 py-4 text-center">
                                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 uppercase">
                                    {loan.status}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex justify-end gap-2 items-center">
                                    <button 
                                      onClick={() => handleEditLoan(loan)}
                                      className="p-2 text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors group"
                                      title="Edit Loan"
                                    >
                                      <Pencil className="w-5 h-5 group-active:scale-95 transition-transform" />
                                    </button>
                                    <button 
                                      onClick={() => handleReturnTool(loan.id)}
                                      className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors group"
                                      title="Return / Close Loan"
                                    >
                                      <CheckCircle2 className="w-5 h-5 group-active:scale-90 transition-transform" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {loans.filter(l => l.status === 'active').length === 0 && (
                              <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-slate-500 italic">No active loans found</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile View */}
                      <div className="divide-y divide-slate-100 lg:hidden">
                        {sortedLoans.filter(l => l.status === 'active').slice(0, 5).map((loan, idx) => (
                          <div key={`loan-dash-mob-${loan.id}-${idx}`} className="p-4 space-y-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-bold text-slate-800">{loan.toolName}</div>
                                <div className="text-xs text-slate-500">{loan.typeSize}</div>
                              </div>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700">
                                {loan.status}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <p className="text-slate-400 font-bold uppercase text-[10px]">Borrower</p>
                                <p className="text-slate-700">{loan.borrowerName}</p>
                              </div>
                              <div>
                                <p className="text-slate-400 font-bold uppercase text-[10px]">Date</p>
                                <p className="text-slate-700">{format(parseISO(loan.borrowDate), 'MMM dd, HH:mm')}</p>
                              </div>
                            </div>
                            <div className="flex gap-2 pt-1 border-t border-slate-50 mt-2">
                              <button 
                                onClick={() => handleEditLoan(loan)}
                                className="flex-1 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg font-bold text-[10px] uppercase hover:bg-indigo-100 transition-colors flex items-center justify-center gap-1"
                              >
                                <Pencil className="w-3 h-3" /> Edit
                              </button>
                              <button 
                                onClick={() => handleReturnTool(loan.id)}
                                className="flex-1 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg font-bold text-[10px] uppercase hover:bg-emerald-100 transition-colors flex items-center justify-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Return
                              </button>
                            </div>
                          </div>
                        ))}
                        {loans.filter(l => l.status === 'active').length === 0 && (
                          <div className="p-8 text-center text-slate-500 italic text-sm">No active loans found</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {activeTab === 'loans' && (
                  <div className="space-y-6">
                      <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold text-slate-800">Loan Management</h3>
                        <button 
                          onClick={() => {
                            setEditingLoanId(null);
                            setNewLoan({
                              status: 'active',
                              section: 'Track',
                              shift: 'Day',
                              toolName: '',
                              typeSize: '',
                              borrowerName: '',
                              borrowDate: new Date().toISOString()
                            });
                            setIsAddLoanModalOpen(true);
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium shadow-sm transition-all"
                        >
                          <Plus className="w-4 h-4" /> Add Loan
                        </button>
                      </div>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-50/50">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                          <h3 className="text-lg font-semibold text-slate-800">Recent Loans</h3>
                          <select 
                            className="text-xs font-bold bg-white border border-slate-200 rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500 text-slate-600"
                            value={loanSectionFilter}
                            onChange={(e) => setLoanSectionFilter(e.target.value)}
                          >
                            <option value="all">ALL SECTIONS</option>
                            <option value="Track">TRACK</option>
                            <option value="Wheel Big">WHEEL BIG</option>
                            <option value="Wheel Small">WHEEL SMALL</option>
                            <option value="SSE">SSE</option>
                            <option value="Tyre">TYRE</option>
                            <option value="OVH">OVH</option>
                            <option value="Planner">PLANNER</option>
                            <option value="Lainnya">LAINNYA</option>
                          </select>
                        </div>
                        <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
                          {(['all', 'active', 'returned'] as const).map((status, sIdx) => (
                            <button
                              key={`loan-filter-${status}-${sIdx}`}
                              onClick={() => setLoanStatusFilter(status)}
                              className={cn(
                                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-wider",
                                loanStatusFilter === status 
                                  ? "bg-white text-indigo-600 shadow-sm" 
                                  : "text-slate-500 hover:text-slate-700"
                              )}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      {/* Desktop View */}
                      <div className="hidden lg:block overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                            <tr>
                              <th className="px-6 py-3 font-semibold">Tool</th>
                              <th className="px-6 py-3 font-semibold">Borrower</th>
                              <th className="px-6 py-3 font-semibold">Section</th>
                              <th className="px-6 py-3 font-semibold">Shift</th>
                              <th className="px-6 py-3 font-semibold">Date</th>
                              <th className="px-6 py-3 font-semibold text-center">Status</th>
                              <th className="px-6 py-3 font-semibold text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {processedLoans.map((loan, idx) => (
                              <tr key={`loan-all-dt-${loan.id}-${idx}`} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4">
                                  <div className="font-medium text-slate-700">{loan.toolName}</div>
                                  <div className="text-xs text-slate-400">{loan.typeSize}</div>
                                </td>
                                <td className="px-6 py-4 text-slate-600">{loan.borrowerName}</td>
                                <td className="px-6 py-4 text-slate-500 text-sm">{loan.section}</td>
                                <td className="px-6 py-4 text-slate-500 text-sm">{loan.shift}</td>
                                <td className="px-6 py-4 text-slate-500 text-sm">{format(parseISO(loan.borrowDate), 'MMM dd, HH:mm')}</td>
                                <td className="px-6 py-4 text-center">
                                  <span 
                                    className={cn(
                                      "px-2.5 py-1 rounded-full text-xs font-medium", 
                                      loan.status === 'active' ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                                    )}
                                    title={loan.status === 'active' ? "Tool is currently borrowed and not yet returned" : "Tool has been returned to the toolroom"}
                                  >
                                    {loan.status}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex justify-end gap-2 items-center">
                                    {loan.status === 'active' ? (
                                      <button 
                                        onClick={() => handleReturnTool(loan.id)}
                                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors mr-2"
                                      >
                                        Return Tool
                                      </button>
                                    ) : (
                                      <button 
                                        onClick={() => handleReactivateLoan(loan.id)}
                                        className="text-xs font-bold text-amber-600 hover:text-amber-800 transition-colors mr-2 flex items-center gap-1"
                                        title="Change back to Active"
                                      >
                                        <RotateCcw className="w-3 h-3" /> Re-activate
                                      </button>
                                    )}
                                    <button 
                                      onClick={() => handleEditLoan(loan)}
                                      className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                      title="Edit Loan"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </button>
                                    <button 
                                      onClick={() => handleDeleteLoan(loan.id)}
                                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                      title="Delete Loan"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile View */}
                      <div className="lg:hidden divide-y divide-slate-100">
                        {processedLoans.map((loan, idx) => (
                          <div key={`loan-all-mob-${loan.id}-${idx}`} className="p-4 space-y-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-bold text-slate-800">{loan.toolName}</div>
                                <div className="text-xs text-slate-500">{loan.typeSize}</div>
                              </div>
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider", 
                                loan.status === 'active' ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                              )}>
                                {loan.status}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <p className="text-slate-400 font-bold uppercase text-[10px]">Borrower</p>
                                <p className="text-slate-700">{loan.borrowerName}</p>
                              </div>
                              <div>
                                <p className="text-slate-400 font-bold uppercase text-[10px]">Section</p>
                                <p className="text-slate-700">{loan.section}</p>
                              </div>
                              <div>
                                <p className="text-slate-400 font-bold uppercase text-[10px]">Shift</p>
                                <p className="text-slate-700">{loan.shift}</p>
                              </div>
                              <div>
                                <p className="text-slate-400 font-bold uppercase text-[10px]">Date</p>
                                <p className="text-slate-700">{format(parseISO(loan.borrowDate), 'MMM dd, HH:mm')}</p>
                              </div>
                            </div>
                            <div className="flex gap-2 pt-1">
                              {loan.status === 'active' ? (
                                <button 
                                  onClick={() => handleReturnTool(loan.id)}
                                  className="flex-1 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors"
                                >
                                  Return Tool
                                </button>
                              ) : (
                                <button 
                                  onClick={() => handleReactivateLoan(loan.id)}
                                  className="flex-1 py-2 bg-amber-50 text-amber-600 rounded-lg text-xs font-bold hover:bg-amber-100 transition-colors flex items-center justify-center gap-1"
                                >
                                  <RotateCcw className="w-3 h-3" /> Re-activate
                                </button>
                              )}
                              <button 
                                onClick={() => handleEditLoan(loan)}
                                className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors flex-none"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDeleteLoan(loan.id)}
                                className="p-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors flex-none"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                </div>
                )}
                {activeTab === 'maintenance' && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                      <h3 className="text-lg font-semibold text-slate-800">Maintenance History</h3>
                      <button 
                        onClick={() => {
                          setEditingMaintenanceId(null);
                          setNewMaintenanceLog({
                            date: new Date().toISOString().split('T')[0],
                            toolName: '',
                            description: '',
                            cost: 0,
                            technician: ''
                          });
                          setIsAddMaintenanceModalOpen(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium shadow-sm transition-all"
                      >
                        <Plus className="w-4 h-4" /> Add Maintenance
                      </button>
                    </div>
                    {/* Desktop View */}
                    <div className="hidden lg:block overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                          <tr>
                            <th className="px-6 py-3 font-semibold">Tool</th>
                            <th className="px-6 py-3 font-semibold">Date</th>
                            <th className="px-6 py-3 font-semibold">Description</th>
                            <th className="px-6 py-3 font-semibold">Technician</th>
                            <th className="px-6 py-3 font-semibold text-right">Cost</th>
                            <th className="px-6 py-3 font-semibold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {maintenanceLogs.map((log, idx) => (
                            <tr key={`maint-dt-${log.id}-${idx}`} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4 font-medium text-slate-700">{log.toolName}</td>
                              <td className="px-6 py-4 text-slate-500 text-sm">{format(parseISO(log.date), 'MMM dd, yyyy')}</td>
                              <td className="px-6 py-4 text-slate-600">{log.description}</td>
                              <td className="px-6 py-4 text-slate-600">{log.technician}</td>
                              <td className="px-6 py-4 text-slate-700 font-mono text-right">Rp {log.cost.toLocaleString('id-ID')}</td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <button 
                                    onClick={() => handleEditMaintenance(log)}
                                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                  >
                                    <Wrench className="w-4 h-4" />
                                  </button>
                                  {isSuperAdmin && (
                                    <button 
                                      onClick={() => handleDeleteMaintenance(log.id)}
                                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile View */}
                    <div className="lg:hidden divide-y divide-slate-100">
                      {maintenanceLogs.map((log, idx) => (
                        <div key={`maint-mob-${log.id}-${idx}`} className="p-4 space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-bold text-slate-800">{log.toolName}</div>
                              <div className="text-xs text-slate-500">{format(parseISO(log.date), 'MMM dd, yyyy')}</div>
                            </div>
                            <div className="text-sm font-mono font-bold text-slate-700">Rp {log.cost.toLocaleString('id-ID')}</div>
                          </div>
                          <p className="text-xs text-slate-600 line-clamp-2">{log.description}</p>
                          <div className="flex justify-between items-center pt-2">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tech: {log.technician}</div>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => handleEditMaintenance(log)}
                                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              >
                                <Wrench className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDeleteMaintenance(log.id)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {activeTab === 'master-toolbox' && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                      <h3 className="text-lg font-semibold text-slate-800">Master Data Toolbox</h3>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            setEditingToolboxId(null);
                            setNewToolbox({ idToolbox: '', name: '', nrp: '', section: 'TRACK MECHANIC', badCount: 0, naCount: 0 });
                            setIsAddToolboxModalOpen(true);
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium shadow-sm transition-all"
                        >
                          <Plus className="w-4 h-4" /> Add Toolbox
                        </button>
                      </div>
                    </div>
                    {/* Desktop View */}
                    <div className="hidden lg:block overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                          <tr>
                            <th className="px-6 py-3 font-semibold">ID Toolbox</th>
                            <th className="px-6 py-3 font-semibold">Name</th>
                            <th className="px-6 py-3 font-semibold">NRP</th>
                            <th className="px-6 py-3 font-semibold">Section</th>
                            <th className="px-6 py-3 font-semibold text-center">Condition (B/NA)</th>
                            <th className="px-6 py-3 font-semibold text-center">Last Inspection</th>
                            <th className="px-6 py-3 font-semibold text-right">Tool Count</th>
                            <th className="px-6 py-3 font-semibold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {toolboxesWithLastInspection.map((tb, idx) => (
                            <tr key={`master-tb-dt-${tb.id}-${idx}`} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4 font-mono text-sm text-slate-700">{tb.idToolbox}</td>
                              <td className="px-6 py-4 font-medium text-slate-700">{tb.name}</td>
                              <td className="px-6 py-4 text-slate-600">{tb.nrp}</td>
                              <td className="px-6 py-4 text-slate-600">{tb.section}</td>
                              <td className="px-6 py-4 text-center">
                                <div className="flex justify-center gap-1 text-[10px] font-bold">
                                  <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded" title="Bad">{tb.badCount || 0}</span>
                                  <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded" title="Broken">{tb.brokenCount || 0}</span>
                                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded" title="N/A">{tb.naCount || 0}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center text-xs text-slate-500">
                                {tb.lastInspectionDate ? format(parseISO(tb.lastInspectionDate), 'MMM dd, yyyy') : '-'}
                              </td>
                              <td className="px-6 py-4 text-slate-700 text-right">{tb.toolCount}</td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <button 
                                    onClick={() => {
                                      const results: Record<string, InspectionStatus> = {};
                                      tb.latestItems.forEach(item => {
                                        results[item.toolDetailId] = item.status;
                                      });
                                      generateToolboxPdf(tb.id, results, tb.lastInspectionDate);
                                    }}
                                    className="p-1 text-slate-600 hover:bg-slate-50 rounded transition-colors"
                                    title="Print Latest Inspection"
                                    disabled={!tb.lastInspectionDate}
                                  >
                                    <Printer className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => handleEditToolbox(tb)}
                                    className="p-1 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                    title="Edit Toolbox"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  {isSuperAdmin && (
                                    <button 
                                      onClick={() => handleDeleteToolbox(tb.id)}
                                      className="p-1 text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                      title="Delete Toolbox"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile View */}
                    <div className="lg:hidden divide-y divide-slate-100">
                      {toolboxesWithLastInspection.map((tb, idx) => (
                        <div key={`master-tb-mob-${tb.id}-${idx}`} className="p-4 space-y-2">
                          <div className="flex justify-between items-start">
                            <div className="font-bold text-slate-800">{tb.name}</div>
                            <div className="flex items-center gap-2">
                              <div className="font-mono text-xs text-slate-500">{tb.idToolbox}</div>
                              <button 
                                onClick={() => {
                                  const results: Record<string, InspectionStatus> = {};
                                  tb.latestItems.forEach(item => {
                                    results[item.toolDetailId] = item.status;
                                  });
                                  generateToolboxPdf(tb.id, results, tb.lastInspectionDate);
                                }}
                                className="p-1 text-slate-600"
                                disabled={!tb.lastInspectionDate}
                              >
                                <Printer className="w-3 h-3" />
                              </button>
                              <button onClick={() => handleEditToolbox(tb)} className="p-1 text-indigo-600"><Pencil className="w-3 h-3" /></button>
                              <button onClick={() => handleDeleteToolbox(tb.id)} className="p-1 text-rose-600"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <p className="text-slate-400 font-bold uppercase text-[10px]">NRP</p>
                              <p className="text-slate-700">{tb.nrp}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 font-bold uppercase text-[10px]">Section</p>
                              <p className="text-slate-700">{tb.section}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 font-bold uppercase text-[10px]">Condition (B/BR/NA)</p>
                              <div className="flex gap-1 text-[9px] font-bold mt-0.5">
                                <span className="px-1 bg-yellow-100 text-yellow-700 rounded">{tb.badCount || 0}</span>
                                <span className="px-1 bg-red-100 text-red-700 rounded">{tb.brokenCount || 0}</span>
                                <span className="px-1 bg-blue-100 text-blue-700 rounded">{tb.naCount || 0}</span>
                              </div>
                            </div>
                            <div>
                              <p className="text-slate-400 font-bold uppercase text-[10px]">Last Inspection</p>
                              <p className="text-slate-700">{tb.lastInspectionDate ? format(parseISO(tb.lastInspectionDate), 'MMM dd, yyyy') : '-'}</p>
                            </div>
                          </div>
                          <div className="pt-2 flex justify-between items-center border-t border-slate-50">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Tools</span>
                            <span className="text-sm font-bold text-indigo-600">{tb.toolCount} items</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'master-inventory' && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                      <h3 className="text-lg font-semibold text-slate-800">Master Data Inventory</h3>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input 
                            type="text" 
                            placeholder="Search Tool ID, Merk, or Desc..." 
                            className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm w-full sm:w-64"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
                        </div>
                        <button 
                          onClick={() => setShowDamagedInventory(!showDamagedInventory)}
                          className={cn(
                            "flex items-center justify-center gap-2 px-4 py-2 rounded-xl border transition-all font-medium text-sm shadow-sm min-w-[160px]",
                            showDamagedInventory ? "bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          {showDamagedInventory ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          {showDamagedInventory ? "Hide Damaged/NA" : "Show Damaged/NA"}
                        </button>
                        <button 
                          onClick={() => {
                            const latestResults = inventoryWithLastInspection.reduce((acc, item) => ({
                              ...acc,
                              [item.id]: item.lastStatus
                            }), {});
                            generateInventoryPdf(latestResults);
                          }}
                          className="flex items-center justify-center gap-2 px-4 py-2 bg-white text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 font-medium shadow-sm transition-all text-sm"
                        >
                          <Printer className="w-4 h-4" /> Print Report
                        </button>
                        <button 
                          onClick={() => {
                            setEditingInventoryId(null);
                            setNewInventoryItem({ toolId: '', merk: '', toolDesc: '', typeSize: '', qty: 0, condition: 'Good' });
                            setIsAddInventoryModalOpen(true);
                          }}
                          className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium shadow-sm transition-all text-sm"
                        >
                          <Plus className="w-4 h-4" /> Add Item
                        </button>
                      </div>
                    </div>
                    {/* Desktop View */}
                    <div className="hidden lg:block overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                          <tr>
                            <th className="px-6 py-3 font-semibold">Tool ID</th>
                            <th className="px-6 py-3 font-semibold">Merk</th>
                            <th className="px-6 py-3 font-semibold">Tool Desc</th>
                            <th className="px-6 py-3 font-semibold">PN/Type/Size</th>
                            <th className="px-6 py-3 font-semibold text-center">Condition</th>
                            <th className="px-6 py-3 font-semibold text-center">Last Inspection</th>
                            <th className="px-6 py-3 font-semibold text-right">Qty</th>
                            <th className="px-6 py-3 font-semibold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {inventoryWithLastInspection
                            .filter(item => 
                              (item.toolId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              item.merk.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              item.toolDesc.toLowerCase().includes(searchQuery.toLowerCase())) &&
                              (showDamagedInventory || !['Bad', 'Broken', 'N/A'].includes(item.lastStatus || 'Good'))
                            )
                            .map((item, idx) => (
                            <tr key={`master-inv-dt-${item.id}-${idx}-${item.toolId}`} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="font-mono text-sm text-slate-700">{item.toolId}</div>
                                {item.lastNotes && (
                                  <div className="mt-1 text-[10px] text-yellow-600 italic max-w-[150px] truncate" title={item.lastNotes}>
                                    Note: {item.lastNotes}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4 font-medium text-slate-700">{item.merk}</td>
                              <td className="px-6 py-4 text-slate-600">{item.toolDesc}</td>
                              <td className="px-6 py-4 text-slate-600">{item.typeSize}</td>
                              <td className="px-6 py-4 text-center">
                                <span className={cn(
                                  "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                                  (item.lastStatus || 'Good') === 'Bad' ? "bg-yellow-100 text-yellow-700" :
                                  (item.lastStatus || 'Good') === 'Broken' ? "bg-red-100 text-red-700" :
                                  (item.lastStatus || 'Good') === 'N/A' ? "bg-blue-100 text-blue-700" :
                                  "bg-green-100 text-green-700"
                                )}>
                                  {item.lastStatus || 'Good'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center text-xs text-slate-500">
                                {item.lastInspectionDate ? format(parseISO(item.lastInspectionDate), 'MMM dd, yyyy') : '-'}
                              </td>
                              <td className="px-6 py-4 text-slate-700 text-right">{item.qty}</td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <button 
                                    onClick={() => handleEditInventoryItem(item)}
                                    className="p-1 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                    title="Edit Item"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  {(isSuperAdmin || item.lastStatus === 'N/A') && (
                                    <button 
                                      onClick={() => handleDeleteInventoryItem(item.id)}
                                      className="p-1 text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                      title="Delete Item"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="lg:hidden divide-y divide-slate-100">
                      {inventoryWithLastInspection
                          .filter(item => 
                            (item.toolId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            item.merk.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            item.toolDesc.toLowerCase().includes(searchQuery.toLowerCase())) &&
                            (showDamagedInventory || !['Bad', 'Broken', 'N/A'].includes(item.lastStatus || 'Good'))
                          )
                        .map((item, idx) => (
                        <div key={`master-inv-mob-${item.id}-${idx}`} className="p-4 space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-bold text-slate-800">{item.toolDesc}</div>
                              {item.lastNotes && (
                                <div className="mt-1 text-[10px] text-amber-600 italic">
                                  Note: {item.lastNotes}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="font-mono text-xs text-slate-500">{item.toolId}</div>
                              <button onClick={() => handleEditInventoryItem(item)} className="p-1 text-indigo-600"><Pencil className="w-3 h-3" /></button>
                              <button onClick={() => handleDeleteInventoryItem(item.id)} className="p-1 text-rose-600"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <p className="text-slate-400 font-bold uppercase text-[10px]">Merk</p>
                              <p className="text-slate-700">{item.merk}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 font-bold uppercase text-[10px]">Condition</p>
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                                (item.lastStatus || item.condition) === 'Bad' ? "bg-yellow-100 text-yellow-700" :
                                (item.lastStatus || item.condition) === 'Broken' ? "bg-red-100 text-red-700" :
                                (item.lastStatus || item.condition) === 'N/A' ? "bg-blue-100 text-blue-700" :
                                "bg-green-100 text-green-700"
                              )}>
                                {item.lastStatus || item.condition || 'Good'}
                              </span>
                            </div>
                            <div>
                              <p className="text-slate-400 font-bold uppercase text-[10px]">PN/Type/Size</p>
                              <p className="text-slate-700">{item.typeSize}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 font-bold uppercase text-[10px]">Last Inspection</p>
                              <p className="text-slate-700">{item.lastInspectionDate ? format(parseISO(item.lastInspectionDate), 'MMM dd, yyyy') : '-'}</p>
                            </div>
                          </div>
                          <div className="pt-2 flex justify-between items-center border-t border-slate-50">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Stock</span>
                            <span className="text-sm font-bold text-emerald-600">{item.qty} units</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'master-detail-toolbox' && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold text-slate-800">Master Data Detail Toolbox</h3>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input 
                            type="text" 
                            placeholder="Search items..." 
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm shadow-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
                        </div>
                        <div className="flex gap-2">
                          <select 
                            className="text-xs font-bold bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-slate-600 shadow-sm"
                            value={toolboxDetailsSortOrder}
                            onChange={(e) => setToolboxDetailsSortOrder(e.target.value as 'asc' | 'desc')}
                          >
                            <option value="asc">SORT: A-Z</option>
                            <option value="desc">SORT: Z-A</option>
                          </select>
                          <button 
                            onClick={() => setShowDamagedDetails(!showDamagedDetails)}
                            className={cn(
                              "flex items-center justify-center gap-2 px-4 py-2 rounded-xl border transition-all font-medium text-sm shadow-sm",
                              showDamagedDetails ? "bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                            )}
                            title={showDamagedDetails ? "Hide Damaged/NA Items" : "Show Damaged/NA Items"}
                          >
                            {showDamagedDetails ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            <span className="hidden sm:inline">{showDamagedDetails ? "Hide Damaged" : "Show Damaged/NA"}</span>
                          </button>
                          <button 
                            onClick={() => setIsAddDetailToolboxModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium shadow-sm transition-all text-sm"
                          >
                            <Plus className="w-4 h-4" /> Add Detail
                          </button>
                        </div>
                      </div>
                    </div>
                    {/* Desktop View */}
                    <div className="hidden lg:block overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                          <tr>
                            <th className="px-6 py-3 font-semibold">Merk</th>
                            <th className="px-6 py-3 font-semibold">Tool Desc</th>
                            <th className="px-6 py-3 font-semibold">PN/Size/Type</th>
                            <th className="px-6 py-3 font-semibold text-right">Qty</th>
                            <th className="px-6 py-3 font-semibold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {toolboxDetailsWithLastInspection
                            .filter(detail => 
                              (detail.merk.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              detail.toolDesc.toLowerCase().includes(searchQuery.toLowerCase())) &&
                              (showDamagedDetails || !['Bad', 'Broken', 'N/A'].includes(detail.lastStatus || 'Good'))
                            )
                            .map((detail, idx) => (
                            <tr key={`mtb-det-dt-${detail.id}-${idx}`} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="text-slate-600 font-medium">{detail.merk}</div>
                                {detail.lastNotes && (
                                  <div className="mt-0.5 text-[10px] text-amber-600 italic max-w-[150px] truncate" title={detail.lastNotes}>
                                    Note: {detail.lastNotes}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4 text-slate-600">{detail.toolDesc}</td>
                              <td className="px-6 py-4 text-slate-600">{detail.typeSize}</td>
                              <td className="px-6 py-4 text-center">
                                <span className={cn(
                                  "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                                  (detail.lastStatus || 'Good') === 'Bad' ? "bg-yellow-100 text-yellow-700" :
                                  (detail.lastStatus || 'Good') === 'Broken' ? "bg-red-100 text-red-700" :
                                  (detail.lastStatus || 'Good') === 'N/A' ? "bg-blue-100 text-blue-700" :
                                  "bg-green-100 text-green-700"
                                )}>
                                  {detail.lastStatus || 'Good'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-slate-700 text-right">{detail.qty}</td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <button 
                                    onClick={() => handleEditDetailToolbox(detail)}
                                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                  >
                                    <Wrench className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteDetailToolbox(detail.id)}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile View */}
                    <div className="lg:hidden divide-y divide-slate-100">
                      {toolboxDetailsWithLastInspection
                        .filter(detail => 
                          (detail.merk.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          detail.toolDesc.toLowerCase().includes(searchQuery.toLowerCase())) &&
                          (showDamagedDetails || !['Bad', 'Broken', 'N/A'].includes(detail.lastStatus || 'Good'))
                        )
                        .map((detail, dIdx) => (
                        <div key={`mtb-det-mob-${detail.id}-${dIdx}`} className="p-4 space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-bold text-slate-800">{detail.toolDesc}</div>
                              {detail.lastNotes && (
                                <div className="mt-1 text-[10px] text-amber-600 italic">
                                  Note: {detail.lastNotes}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <button 
                                onClick={() => handleEditDetailToolbox(detail)}
                                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              >
                                <Wrench className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => handleDeleteDetailToolbox(detail.id)}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <p className="text-slate-400 font-bold uppercase text-[10px]">Merk</p>
                              <p className="text-slate-700">{detail.merk}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 font-bold uppercase text-[10px]">PN/Size/Type</p>
                              <p className="text-slate-700">{detail.typeSize}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 font-bold uppercase text-[10px]">Condition</p>
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                                (detail.lastStatus || 'Good') === 'Bad' ? "bg-yellow-100 text-yellow-700" :
                                (detail.lastStatus || 'Good') === 'Broken' ? "bg-red-100 text-red-700" :
                                (detail.lastStatus || 'Good') === 'N/A' ? "bg-blue-100 text-blue-700" :
                                "bg-green-100 text-green-700"
                              )}>
                                {detail.lastStatus || 'Good'}
                              </span>
                            </div>
                            <div>
                              <p className="text-slate-400 font-bold uppercase text-[10px]">Quantity</p>
                              <p className="text-sm font-bold text-slate-700">{detail.qty}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'progress-order' && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <h3 className="text-lg font-semibold text-slate-800">Order Tool</h3>
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filter Status:</label>
                          <select 
                            className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500 text-slate-600"
                            value={orderStatusFilter}
                            onChange={(e) => setOrderStatusFilter(e.target.value)}
                          >
                            <option value="all">ALL STATUS</option>
                            <option value="Progress">Progress</option>
                            <option value="Waiting Approval">Waiting Approval</option>
                            <option value="Cancel">Cancel</option>
                            <option value="Block Vendor">Block Vendor</option>
                            <option value="Supply">Supply</option>
                          </select>
                        </div>
                      </div>
                      <button 
                        onClick={() => setIsAddOrderModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium shadow-sm transition-all text-sm"
                      >
                        <Plus className="w-4 h-4" /> Add Order
                      </button>
                    </div>
                    {/* Desktop View */}
                    <div className="hidden lg:block overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                          <tr>
                            <th className="px-6 py-3 font-semibold">Date</th>
                            <th className="px-6 py-3 font-semibold">Merk</th>
                            <th className="px-6 py-3 font-semibold">Tool Desc</th>
                            <th className="px-6 py-3 font-semibold">PN/Size/Type</th>
                            <th className="px-6 py-3 font-semibold">Qty</th>
                            <th className="px-6 py-3 font-semibold">Vendor</th>
                            <th className="px-6 py-3 font-semibold">PR</th>
                            <th className="px-6 py-3 font-semibold">PO</th>
                            <th className="px-6 py-3 font-semibold">Status</th>
                            <th className="px-6 py-3 font-semibold">Remarks</th>
                            <th className="px-6 py-3 font-semibold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {processedOrders.map((order, idx) => (
                            <tr key={`order-dt-${order.id}-${idx}`} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4 text-sm text-slate-600">{order.date}</td>
                              <td className="px-6 py-4 font-medium text-slate-700">{order.merk}</td>
                              <td className="px-6 py-4 text-slate-600">{order.toolDesc}</td>
                              <td className="px-6 py-4 text-slate-500">{order.typeSize}</td>
                              <td className="px-6 py-4 text-slate-700">{order.qty}</td>
                              <td className="px-6 py-4 text-slate-600">{order.vendor}</td>
                              <td className="px-6 py-4 text-slate-600 font-mono text-xs">{order.pr}</td>
                              <td className="px-6 py-4 text-slate-600 font-mono text-xs">{order.po}</td>
                              <td className="px-6 py-4">
                                <span className={cn(
                                  "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                  order.status === 'Progress' && "bg-blue-100 text-blue-700",
                                  order.status === 'Waiting Approval' && "bg-yellow-100 text-yellow-700",
                                  order.status === 'Cancel' && "bg-red-100 text-red-700",
                                  order.status === 'Block Vendor' && "bg-slate-100 text-slate-700",
                                  order.status === 'Supply' && "bg-green-100 text-green-700"
                                )}>
                                  {order.status}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-slate-500 text-xs italic">{order.remarks}</td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <button 
                                    onClick={() => handleEditOrder(order)}
                                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                  >
                                    <Wrench className="w-4 h-4" />
                                  </button>
                                  {isSuperAdmin && (
                                    <button 
                                      onClick={() => handleDeleteOrder(order.id)}
                                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile View */}
                    <div className="lg:hidden divide-y divide-slate-100">
                      {processedOrders.map((order, idx) => (
                        <div key={`order-mob-${order.id}-${idx}`} className="p-4 space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-bold text-slate-800">{order.toolDesc}</div>
                              <div className="text-xs text-slate-500">{order.merk} - {order.typeSize}</div>
                            </div>
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                              order.status === 'Progress' && "bg-blue-100 text-blue-700",
                              order.status === 'Waiting Approval' && "bg-yellow-100 text-yellow-700",
                              order.status === 'Cancel' && "bg-red-100 text-red-700",
                              order.status === 'Block Vendor' && "bg-slate-100 text-slate-700",
                              order.status === 'Supply' && "bg-green-100 text-green-700"
                            )}>
                              {order.status}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-xs">
                            <div>
                              <p className="text-slate-400 font-bold uppercase text-[10px]">Vendor</p>
                              <p className="text-slate-700 truncate">{order.vendor}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 font-bold uppercase text-[10px]">Date</p>
                              <p className="text-slate-700">{order.date}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 font-bold uppercase text-[10px]">PR / PO</p>
                              <p className="text-slate-700 font-mono text-[10px]">{order.pr || '-'} / {order.po || '-'}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 font-bold uppercase text-[10px]">Qty</p>
                              <p className="text-slate-700 font-bold">{order.qty}</p>
                            </div>
                          </div>
                          {order.remarks && (
                            <div className="p-2 bg-slate-50 rounded-lg text-[10px] text-slate-500 italic">
                              {order.remarks}
                            </div>
                          )}
                          <div className="flex justify-end gap-2 pt-1">
                            <button 
                              onClick={() => handleEditOrder(order)}
                              className="flex-1 py-2 flex justify-center items-center gap-2 text-indigo-600 bg-indigo-50 rounded-lg text-xs font-bold"
                            >
                              <Wrench className="w-4 h-4" /> Edit
                            </button>
                            <button 
                              onClick={() => handleDeleteOrder(order.id)}
                              className="flex-1 py-2 flex justify-center items-center gap-2 text-red-600 bg-red-50 rounded-lg text-xs font-bold"
                            >
                              <X className="w-4 h-4" /> Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'inspection-daily' && (
                  <div className="space-y-6">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 lg:p-6">
                      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-stretch lg:items-end">
                        <div className="flex-1 space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select Toolbox for Inspection</label>
                          <select 
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            value={selectedToolboxId}
                            onChange={(e) => {
                              setSelectedToolboxId(e.target.value);
                              setInspectionResults({});
                            }}
                          >
                            <option value="">Choose a toolbox...</option>
                            {toolboxesWithLastInspection.map(tb => (
                              <option key={`opt-tb-${tb.id}`} value={tb.id}>{tb.idToolbox} - {tb.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {selectedToolboxId && (
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-100">
                          <h3 className="text-lg font-semibold text-slate-800">
                            Tools in {toolboxes.find(tb => tb.id === selectedToolboxId)?.idToolbox}
                          </h3>
                        </div>
                        {/* Desktop View */}
                        <div className="hidden lg:block overflow-x-auto">
                          <table className="w-full text-left">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                              <tr>
                                <th className="px-6 py-3 font-semibold">Merk</th>
                                <th className="px-6 py-3 font-semibold">Tool Desc</th>
                                <th className="px-6 py-3 font-semibold">PN/Size/Type</th>
                                <th className="px-6 py-3 font-semibold text-center">Condition</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {toolboxDetails.map((detail, idx) => (
                                <tr key={`ins-tb-dt-${detail.id}-${idx}`} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-6 py-4 font-medium text-slate-700">{detail.merk}</td>
                                  <td className="px-6 py-4 text-slate-600">{detail.toolDesc}</td>
                                  <td className="px-6 py-4 text-slate-500">{detail.typeSize}</td>
                                  <td className="px-6 py-4">
                                    <div className="flex flex-col gap-2">
                                      <div className="flex justify-center items-center gap-2">
                                        {(['Good', 'Bad', 'Broken', 'N/A'] as InspectionStatus[]).map((status, sIdx) => (
                                          <div key={`ins-tb-dt-stat-${detail.id}-${status}-${sIdx}`}>
                                            <InspectionStatusButton 
                                              status={status}
                                              current={inspectionResults[detail.id] || 'Good'}
                                              onClick={() => setInspectionResults(prev => ({ ...prev, [detail.id]: status }))}
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile View */}
                        <div className="lg:hidden divide-y divide-slate-100">
                          {toolboxDetails.map((detail, idx) => (
                            <div key={`ins-tb-mob-${detail.id}-${idx}`} className="p-4 space-y-3">
                              <div className="flex justify-between items-start">
                                <div>
                                  <div className="font-bold text-slate-800">{detail.toolDesc}</div>
                                  <div className="text-xs text-slate-500">{detail.merk} - {detail.typeSize}</div>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                {(['Good', 'Bad', 'Broken', 'N/A'] as InspectionStatus[]).map((status, sIdx) => (
                                  <div key={`ins-tb-mob-stat-${detail.id}-${status}-${sIdx}`}>
                                    <InspectionStatusButton 
                                      status={status}
                                      current={inspectionResults[detail.id] || 'Good'}
                                      onClick={() => setInspectionResults(prev => ({ ...prev, [detail.id]: status }))}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                          <button 
                            onClick={handleSaveDailyInspection}
                            disabled={!selectedToolboxId}
                            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200 text-sm"
                          >
                            Save Inspection
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'inspection-toolroom' && (
                  <div className="space-y-6">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 lg:p-6">
                      <h3 className="text-lg font-semibold text-slate-800">Toolroom Inventory Inspection</h3>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        {/* Desktop View */}
                        <div className="hidden lg:block overflow-x-auto">
                          <table className="w-full text-left">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                              <tr>
                                <th className="px-6 py-3 font-semibold">Tool ID</th>
                                <th className="px-6 py-3 font-semibold">Merk</th>
                                <th className="px-6 py-3 font-semibold">Tool Desc</th>
                                <th className="px-6 py-3 font-semibold text-center">Condition</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {inventoryWithLastInspection.map((item, idx) => (
                                <tr key={`ins-inv-dt-${item.id}-${idx}`} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-6 py-4 font-mono text-sm text-slate-700">{item.toolId}</td>
                                  <td className="px-6 py-4 font-medium text-slate-700">{item.merk}</td>
                                  <td className="px-6 py-4 text-slate-600">{item.toolDesc}</td>
                                  <td className="px-6 py-4">
                                    <div className="flex flex-col gap-2">
                                      <div className="flex justify-center items-center gap-2">
                                        {(['Good', 'Bad', 'Broken', 'N/A'] as InspectionStatus[]).map((status, sIdx) => (
                                          <div key={`ins-inv-dt-stat-${item.id}-${status}-${sIdx}`}>
                                            <InspectionStatusButton 
                                              status={status}
                                              current={inspectionResults[item.id] || 'Good'}
                                              onClick={() => setInspectionResults(prev => ({ ...prev, [item.id]: status }))}
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile View */}
                        <div className="lg:hidden divide-y divide-slate-100">
                          {inventoryWithLastInspection.map((item, idx) => (
                            <div key={`ins-inv-mob-${item.id}-${idx}`} className="p-4 space-y-3">
                              <div className="flex justify-between items-start">
                                <div>
                                  <div className="font-bold text-slate-800">{item.toolDesc}</div>
                                  <div className="text-xs text-slate-500">{item.toolId} - {item.merk}</div>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                {(['Good', 'Bad', 'Broken', 'N/A'] as InspectionStatus[]).map((status, sIdx) => (
                                  <div key={`ins-inv-mob-stat-${item.id}-${status}-${sIdx}`}>
                                    <InspectionStatusButton 
                                      status={status}
                                      current={inspectionResults[item.id] || 'Good'}
                                      onClick={() => setInspectionResults(prev => ({ ...prev, [item.id]: status }))}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                          <button 
                            onClick={handleSaveToolroomInspection}
                            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 text-sm"
                          >
                            Save Inspection
                          </button>
                        </div>
                    </div>
                  </div>
                )}
                {activeTab === 'settings' && (
                  <div className="space-y-6">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                      <h3 className="text-lg font-semibold text-slate-800 mb-4">System Settings</h3>
                      <div className="space-y-4">
                        {isSuperAdmin && (
                          <>
                            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                              <h4 className="font-bold text-indigo-900 flex items-center gap-2">
                                <Database className="w-4 h-4" /> Initialize Database
                              </h4>
                              <p className="text-sm text-indigo-700 mt-1">If this is your first time setting up the system, you can seed the database with initial master data.</p>
                              <button 
                                onClick={seedData}
                                className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors"
                              >
                                Seed Initial Data
                              </button>
                            </div>

                            <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                              <h4 className="font-bold text-amber-900 flex items-center gap-2">
                                <Trash2 className="w-4 h-4" /> Cleanup Duplicates
                              </h4>
                              <p className="text-sm text-amber-700 mt-1">Remove duplicate entries from Inventory and Toolboxes based on their IDs.</p>
                              <button 
                                onClick={cleanupDuplicates}
                                className="mt-4 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 transition-colors"
                              >
                                Run Cleanup
                              </button>
                            </div>
                          </>
                        )}
                        
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                          <div>
                            <p className="font-bold text-slate-800">Export All Data</p>
                            <p className="text-xs text-slate-500">Download all records in Excel format</p>
                          </div>
                          <button 
                            onClick={exportToExcel}
                            className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                          >
                            <Printer className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </main>

      <AnimatePresence>
        {isAddMaintenanceModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800">{editingMaintenanceId ? 'Edit Maintenance' : 'Add Maintenance'}</h3>
                <button onClick={() => setIsAddMaintenanceModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleAddMaintenance} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Tool Name</label>
                  <input 
                    required 
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Enter tool name"
                    value={newMaintenanceLog.toolName || ''}
                    onChange={e => setNewMaintenanceLog({...newMaintenanceLog, toolName: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Date</label>
                    <input 
                      type="date"
                      required 
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={newMaintenanceLog.date || ''}
                      onChange={e => setNewMaintenanceLog({...newMaintenanceLog, date: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Cost (IDR)</label>
                    <input 
                      type="number"
                      required 
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={newMaintenanceLog.cost || 0}
                      onChange={e => setNewMaintenanceLog({...newMaintenanceLog, cost: Number(e.target.value)})}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Technician</label>
                  <input 
                    required 
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Enter technician name"
                    value={newMaintenanceLog.technician || ''}
                    onChange={e => setNewMaintenanceLog({...newMaintenanceLog, technician: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
                  <textarea 
                    required 
                    rows={3}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Enter maintenance details"
                    value={newMaintenanceLog.description || ''}
                    onChange={e => setNewMaintenanceLog({...newMaintenanceLog, description: e.target.value})}
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setIsAddMaintenanceModalOpen(false)} className="flex-1 py-3 px-4 bg-slate-50 text-slate-600 rounded-xl font-bold hover:bg-slate-100 transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 py-3 px-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">
                    {editingMaintenanceId ? 'Update Log' : 'Save Log'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {isAddLoanModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800">{editingLoanId ? 'Edit Loan' : 'Add New Loan'}</h3>
                <button onClick={() => setIsAddLoanModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleAddLoan} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Borrow Date & Time</label>
                  <input 
                    type="datetime-local"
                    required 
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    value={newLoan.borrowDate ? new Date(newLoan.borrowDate).toLocaleString('sv-SE').replace(' ', 'T').slice(0, 16) : ''}
                    onChange={e => {
                      const selectedDate = new Date(e.target.value);
                      setNewLoan({...newLoan, borrowDate: selectedDate.toISOString()});
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Name</label>
                  <input 
                    required 
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Enter borrower name"
                    value={newLoan.borrowerName || ''}
                    onChange={e => setNewLoan({...newLoan, borrowerName: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Section</label>
                  <select 
                    required 
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    value={newLoan.section || 'Track'}
                    onChange={e => setNewLoan({...newLoan, section: e.target.value})}
                  >
                    {['Track', 'Wheel Big', 'Wheel Small', 'SSE', 'Tyre', 'OVH', 'Planner', 'Lainnya'].map((sec, sIdx) => (
                      <option key={`loan-sec-opt-${sec}-${sIdx}`} value={sec}>{sec}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Tools Desc</label>
                  <input 
                    required 
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Enter tool description"
                    value={newLoan.toolName || ''}
                    onChange={e => setNewLoan({...newLoan, toolName: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">PN/Type/Size</label>
                    <input 
                      required 
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="e.g. 9553NB"
                      value={newLoan.typeSize || ''}
                      onChange={e => setNewLoan({...newLoan, typeSize: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Shift</label>
                    <select 
                      required 
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={newLoan.shift || 'Day'}
                      onChange={e => setNewLoan({...newLoan, shift: e.target.value as 'Day' | 'Night'})}
                    >
                      <option value="Day">Day</option>
                      <option value="Night">Night</option>
                    </select>
                  </div>
                </div>
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setIsAddLoanModalOpen(false)} className="flex-1 py-3 px-4 bg-slate-50 text-slate-600 rounded-xl font-bold hover:bg-slate-100 transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 py-3 px-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">
                    {editingLoanId ? 'Update Loan' : 'Create Loan'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {isAddToolboxModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800">{editingToolboxId ? 'Edit Toolbox' : 'Add New Toolbox'}</h3>
                <button onClick={() => setIsAddToolboxModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleAddToolbox} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">ID Toolbox</label>
                    <input required className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newToolbox.idToolbox} onChange={e => setNewToolbox({...newToolbox, idToolbox: e.target.value})} placeholder="e.g. TB-001" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Name</label>
                    <input required className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newToolbox.name} onChange={e => setNewToolbox({...newToolbox, name: e.target.value})} placeholder="e.g. Ahmad Fauzi" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">NRP</label>
                    <input required className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newToolbox.nrp} onChange={e => setNewToolbox({...newToolbox, nrp: e.target.value})} placeholder="e.g. 123456" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Section</label>
                      <select 
                        required 
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                        value={newToolbox.section}
                        onChange={e => setNewToolbox({...newToolbox, section: e.target.value})}
                      >
                        {['WHEEL BIG', 'WHEEL SMALL', 'TRACK MECHANIC', 'SSE MECHANIC', 'TYRE', 'OVH', 'LAINNYA'].map((sec, sIdx) => (
                          <option key={`tb-add-sec-${sec}-${sIdx}`} value={sec}>{sec}</option>
                        ))}
                      </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Bad</label>
                    <input type="number" className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newToolbox.badCount} onChange={e => setNewToolbox({...newToolbox, badCount: Number(e.target.value)})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">N/A</label>
                    <input type="number" className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newToolbox.naCount} onChange={e => setNewToolbox({...newToolbox, naCount: Number(e.target.value)})} />
                  </div>
                </div>
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setIsAddToolboxModalOpen(false)} className="flex-1 py-3 px-4 bg-slate-50 text-slate-600 rounded-xl font-bold hover:bg-slate-100 transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 py-3 px-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">
                    {editingToolboxId ? 'Update Toolbox' : 'Save Toolbox'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {isAddInventoryModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800">{editingInventoryId ? 'Edit Inventory Item' : 'Add Inventory Item'}</h3>
                <button onClick={() => setIsAddInventoryModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleAddInventoryItem} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Tool ID</label>
                    <input required className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newInventoryItem.toolId} onChange={e => setNewInventoryItem({...newInventoryItem, toolId: e.target.value})} placeholder="e.g. T-001" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Merk</label>
                    <input required className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newInventoryItem.merk} onChange={e => setNewInventoryItem({...newInventoryItem, merk: e.target.value})} placeholder="e.g. DeWalt" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Tool Desc</label>
                    <input required className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newInventoryItem.toolDesc} onChange={e => setNewInventoryItem({...newInventoryItem, toolDesc: e.target.value})} placeholder="e.g. Drill Bit Set" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">PN/Type/Size</label>
                    <input required className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newInventoryItem.typeSize} onChange={e => setNewInventoryItem({...newInventoryItem, typeSize: e.target.value})} placeholder="e.g. HSS 1-10mm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Qty</label>
                    <input type="number" required className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newInventoryItem.qty} onChange={e => setNewInventoryItem({...newInventoryItem, qty: Number(e.target.value)})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Condition</label>
                    <select 
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={newInventoryItem.condition}
                      onChange={e => setNewInventoryItem({...newInventoryItem, condition: e.target.value as InspectionStatus})}
                    >
                      <option value="Good">Good</option>
                      <option value="Bad">Bad</option>
                      <option value="N/A">N/A</option>
                    </select>
                  </div>
                </div>
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setIsAddInventoryModalOpen(false)} className="flex-1 py-3 px-4 bg-slate-50 text-slate-600 rounded-xl font-bold hover:bg-slate-100 transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 py-3 px-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">
                    {editingInventoryId ? 'Update Item' : 'Save Item'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {isAddDetailToolboxModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800">{editingDetailId ? 'Edit Toolbox Detail' : 'Add Toolbox Detail'}</h3>
                <button onClick={() => { setIsAddDetailToolboxModalOpen(false); setEditingDetailId(null); }} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleAddDetailToolbox} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Merk</label>
                    <input required className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newDetailToolbox.merk} onChange={e => setNewDetailToolbox({...newDetailToolbox, merk: e.target.value})} placeholder="e.g. Fluke" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Qty</label>
                    <input type="number" required className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newDetailToolbox.qty} onChange={e => setNewDetailToolbox({...newDetailToolbox, qty: Number(e.target.value)})} min="1" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Tool Desc</label>
                  <input required className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newDetailToolbox.toolDesc} onChange={e => setNewDetailToolbox({...newDetailToolbox, toolDesc: e.target.value})} placeholder="e.g. Digital Multimeter" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">PN/Size / Type</label>
                  <input required className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newDetailToolbox.typeSize} onChange={e => setNewDetailToolbox({...newDetailToolbox, typeSize: e.target.value})} placeholder="e.g. 115 True-RMS" />
                </div>
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setIsAddDetailToolboxModalOpen(false)} className="flex-1 py-3 px-4 bg-slate-50 text-slate-600 rounded-xl font-bold hover:bg-slate-100 transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 py-3 px-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">Save Detail</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {isAddOrderModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800">{editingOrderId ? 'Edit Order Tool' : 'Add Order Tool'}</h3>
                <button onClick={() => { setIsAddOrderModalOpen(false); setEditingOrderId(null); }} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleAddOrder} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Date</label>
                    <input type="date" required className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newOrder.date} onChange={e => setNewOrder({...newOrder, date: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Merk</label>
                    <input required className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newOrder.merk} onChange={e => setNewOrder({...newOrder, merk: e.target.value})} placeholder="e.g. Makita" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Tool Desc</label>
                    <input required className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newOrder.toolDesc} onChange={e => setNewOrder({...newOrder, toolDesc: e.target.value})} placeholder="e.g. Angle Grinder" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">PN/Size/Type</label>
                    <input required className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newOrder.typeSize} onChange={e => setNewOrder({...newOrder, typeSize: e.target.value})} placeholder="e.g. 9553NB" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Qty</label>
                    <input type="number" required className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newOrder.qty} onChange={e => setNewOrder({...newOrder, qty: Number(e.target.value)})} min="1" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Vendor</label>
                    <input required className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newOrder.vendor} onChange={e => setNewOrder({...newOrder, vendor: e.target.value})} placeholder="e.g. PT. Teknik Jaya" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">PR</label>
                    <input required className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newOrder.pr} onChange={e => setNewOrder({...newOrder, pr: e.target.value})} placeholder="e.g. PR-2024-001" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">PO</label>
                    <input required className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newOrder.po} onChange={e => setNewOrder({...newOrder, po: e.target.value})} placeholder="e.g. PO-2024-001" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Status</label>
                    <select className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={newOrder.status} onChange={e => setNewOrder({...newOrder, status: e.target.value})}>
                      <option>Progress</option>
                      <option>Waiting Approval</option>
                      <option>Cancel</option>
                      <option>Block Vendor</option>
                      <option>Supply</option>
                    </select>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Remarks</label>
                    <textarea className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 min-h-[80px]" value={newOrder.remarks} onChange={e => setNewOrder({...newOrder, remarks: e.target.value})} placeholder="Additional notes..." />
                  </div>
                </div>
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => { setIsAddOrderModalOpen(false); setEditingOrderId(null); }} className="flex-1 py-3 px-4 bg-slate-50 text-slate-600 rounded-xl font-bold hover:bg-slate-100 transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 py-3 px-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">{editingOrderId ? 'Update Order' : 'Save Order'}</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {/* Confirm Dialog */}
        <ConfirmModal 
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        />
        <SuccessModal 
          isOpen={successDialog.isOpen}
          title={successDialog.title}
          message={successDialog.message}
          onConfirm={() => {
            successDialog.onConfirm();
            setSuccessDialog(prev => ({ ...prev, isOpen: false }));
          }}
        />
      </AnimatePresence>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, collapsed }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void, collapsed?: boolean }) {
  return (
    <button onClick={onClick} className={cn("w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group", active ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200", collapsed && "justify-center px-0")}>
      <span className={cn("transition-transform duration-200", active ? "scale-110" : "group-hover:scale-110")}>{icon}</span>
      {!collapsed && <span className="font-medium text-sm">{label}</span>}
    </button>
  );
}

function StatCard({ 
  title, 
  value, 
  subtitle, 
  accentColor, 
  badgeColor, 
  textColor 
}: { 
  title: string, 
  value: number, 
  subtitle: string, 
  accentColor: string, 
  badgeColor: string, 
  textColor: string 
}) {
  return (
    <div className={cn(
      "bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[150px] hover:shadow-md transition-all border-l-4", 
      accentColor
    )}>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">{title}</p>
        <p className="text-4xl font-black text-slate-900 tabular-nums">{value}</p>
      </div>
      <div className={cn(
        "mt-4 px-3 py-1.5 rounded-lg inline-flex self-start text-[10px] font-black uppercase tracking-wider", 
        badgeColor, 
        textColor
      )}>
        {subtitle}
      </div>
    </div>
  );
}

function AchievementCard({ 
  title, 
  subtitle,
  value, 
  totalLabel,
  totalValue,
  currentLabel,
  currentValue,
  icon,
  color 
}: { 
  title: string, 
  subtitle: string,
  value: number, 
  totalLabel: string,
  totalValue: number,
  currentLabel: string,
  currentValue: number,
  icon: React.ReactNode,
  color: string 
}) {
  const isDaily = title.includes('DAILY');
  
  return (
    <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
      {/* Background Icon Watermark */}
      <div className="absolute -right-6 -bottom-6 opacity-[0.03] pointer-events-none transform rotate-12 group-hover:scale-110 transition-transform duration-500">
        <div className={cn("w-40 h-40 rounded-full flex items-center justify-center", color)}>
          {icon}
        </div>
      </div>

      <div className="flex justify-between items-start mb-2 relative z-10">
        <div>
          <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-tight">{title}</h3>
          <p className="text-sm text-slate-400 font-medium mt-1">{subtitle}</p>
        </div>
        <div className="bg-indigo-50/80 backdrop-blur-sm px-4 py-2 rounded-2xl border border-indigo-100/50">
          <span className="text-2xl font-black text-indigo-600 leading-none">{value}%</span>
        </div>
      </div>

      <div className="mt-8 mb-10 relative z-10">
        <div className="h-5 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100 p-1">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${value}%` }}
            transition={{ duration: 1.5, ease: "circOut" }}
            className="h-full rounded-full bg-indigo-600 shadow-lg shadow-indigo-200"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 relative z-10">
        <div className="bg-slate-50/80 p-5 rounded-[24px] border border-slate-100/50">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">{totalLabel}</p>
          <p className="text-4xl font-black text-slate-800 tabular-nums">{totalValue}</p>
        </div>
        <div className={cn(
          "p-5 rounded-[24px] border", 
          isDaily ? "bg-emerald-50/50 border-emerald-100/50" : "bg-indigo-50/50 border-indigo-100/50"
        )}>
          <p className={cn(
            "text-[10px] font-black uppercase tracking-[0.2em] mb-2", 
            isDaily ? "text-emerald-600" : "text-indigo-600"
          )}>{currentLabel}</p>
          <p className={cn(
            "text-4xl font-black tabular-nums", 
            isDaily ? "text-emerald-600" : "text-indigo-600"
          )}>{currentValue}</p>
        </div>
      </div>
    </div>
  );
}

const InspectionStatusButton: React.FC<{ 
  status: InspectionStatus, 
  current: InspectionStatus, 
  onClick: () => void 
}> = ({ 
  status, 
  current, 
  onClick 
}) => {
  const colors = {
    'Good': 'bg-green-500 hover:bg-green-600',
    'Bad': 'bg-yellow-500 hover:bg-yellow-600',
    'Broken': 'bg-red-500 hover:bg-red-600',
    'N/A': 'bg-blue-500 hover:bg-blue-600'
  };
  
  const isActive = status === current;
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1 rounded-lg text-[10px] font-bold transition-all uppercase tracking-wider",
        isActive ? colors[status] + " text-white shadow-md scale-105" : "bg-slate-100 text-slate-400 hover:bg-slate-200"
      )}
    >
      {status}
    </button>
  );
};

const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel }: { 
  isOpen: boolean; 
  title: string; 
  message: string; 
  onConfirm: () => void; 
  onCancel: () => void;
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden"
      >
        <div className="p-6">
          <h3 className="text-xl font-bold text-slate-800 mb-2">{title}</h3>
          <p className="text-slate-600">{message}</p>
        </div>
        <div className="bg-slate-50 p-4 flex justify-end gap-3">
          <button 
            onClick={onCancel}
            className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => {
              onConfirm();
              onCancel();
            }}
            className="px-4 py-2 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 shadow-sm transition-all"
          >
            Confirm Delete
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const SuccessModal = ({ isOpen, title, message, onConfirm }: { 
  isOpen: boolean; 
  title: string; 
  message: string; 
  onConfirm: () => void; 
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden border border-emerald-100"
      >
        <div className="p-8 text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>
          <h3 className="text-2xl font-bold text-slate-800 mb-2">{title}</h3>
          <p className="text-slate-600 mb-8">{message}</p>
          <button 
            onClick={onConfirm}
            className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all active:scale-95"
          >
            OK, Understood
          </button>
        </div>
      </motion.div>
    </div>
  );
};
