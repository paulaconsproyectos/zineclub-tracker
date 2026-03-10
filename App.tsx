import { useEffect, useState, useMemo, Component, ErrorInfo, ReactNode } from 'react';
import { 
  db, 
  auth, 
  login, 
  logout, 
  onAuthStateChanged, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  User,
  OperationType,
  handleFirestoreError
} from './firebase';
import { INITIAL_TASKS } from './tasksData';
import { 
  Check, 
  Trash2, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  TrendingUp, 
  DollarSign, 
  Calendar, 
  Users,
  LayoutDashboard,
  Map,
  Receipt,
  FileText,
  BarChart3,
  X
} from 'lucide-react';

type TabId = 'dashboard' | 'roadmap' | 'gastos' | 'report' | 'mrr';

interface Task {
  id: string;
  phase: number;
  title: string;
  date_label: string;
  detail: string;
  type: string;
  tool: string;
  completed: boolean;
  assignee: string | null;
  is_custom?: boolean;
}

interface Gasto {
  id: string;
  concept: string;
  amount: number;
  category: string;
  date: string;
  payer: string;
  type: string;
}

interface MRRSnapshot {
  id: string;
  mrr: number;
  subscribers: number;
  date: string;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Algo salió mal.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        errorMessage = `Error de base de datos: ${parsed.error} (${parsed.operationType} en ${parsed.path})`;
      } catch (e) {
        errorMessage = this.state.error.message || errorMessage;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-[#09090B] text-zinc-100">
          <div className="max-w-md p-8 border border-red-500/20 rounded-2xl bg-red-900/10 backdrop-blur-xl">
            <h1 className="font-serif text-2xl mb-4 text-red-400">¡Vaya! Algo ha fallado</h1>
            <p className="text-zinc-400 mb-6 text-sm leading-relaxed">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

function MainApp() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [mrrHistory, setMrrHistory] = useState<MRRSnapshot[]>([]);
  const [config, setConfig] = useState<any>({
    launchDate: '2025-04-01',
    mrr: 0,
    subs: 0,
    multi: 10
  });
  const [loading, setLoading] = useState(true);
  const [reportOffset, setReportOffset] = useState(0);
  const [filter, setFilter] = useState('all');
  const [isAddingTask, setIsAddingTask] = useState<number | null>(null);

  // --- AUTH ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // --- INITIAL DATA FETCH & REALTIME ---
  useEffect(() => {
    if (!authReady || !user) {
      if (authReady) setLoading(false);
      return;
    }

    setLoading(true);

    // Seed tasks if empty
    const seedTasks = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'tasks'));
        if (snapshot.empty) {
          const batch = INITIAL_TASKS.map(t => {
            const taskDoc = doc(db, 'tasks', t.id);
            return setDoc(taskDoc, { 
              ...t, 
              assignee: null, 
              completed: false, 
              is_custom: false,
              created_at: new Date().toISOString()
            });
          });
          await Promise.all(batch);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'tasks');
      }
    };

    seedTasks();

    // Realtime Subscriptions
    const unsubTasks = onSnapshot(query(collection(db, 'tasks'), orderBy('id', 'asc')), (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Task));
      setTasks(tasksData);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'tasks'));

    const unsubGastos = onSnapshot(query(collection(db, 'gastos'), orderBy('date', 'desc')), (snapshot) => {
      const gastosData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Gasto));
      setGastos(gastosData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'gastos'));

    const unsubMRR = onSnapshot(query(collection(db, 'mrr_snapshots'), orderBy('date', 'desc')), (snapshot) => {
      const mrrData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as MRRSnapshot));
      setMrrHistory(mrrData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'mrr_snapshots'));

    const unsubConfig = onSnapshot(doc(db, 'config', 'main'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setConfig((prev: any) => ({
          ...prev,
          launchDate: data.launch_date || prev.launchDate,
          mrr: data.mrr || prev.mrr,
          subs: data.subscribers || prev.subs,
          multi: data.valuation_multiplier || prev.multi
        }));
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'config/main'));

    return () => {
      unsubTasks();
      unsubGastos();
      unsubMRR();
      unsubConfig();
    };
  }, [authReady, user]);

  // --- ACTIONS ---
  const toggleTask = async (task: Task) => {
    try {
      await updateDoc(doc(db, 'tasks', task.id), { completed: !task.completed });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${task.id}`);
    }
  };

  const setAssignee = async (taskId: string, who: string | null) => {
    const currentTask = tasks.find(t => t.id === taskId);
    const newAssignee = currentTask?.assignee === who ? null : who;
    try {
      await updateDoc(doc(db, 'tasks', taskId), { assignee: newAssignee });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${taskId}`);
    }
  };

  const saveConfig = async (key: string, value: any) => {
    const fieldMap: any = {
      launchDate: 'launch_date',
      mrr: 'mrr',
      subs: 'subscribers',
      multi: 'valuation_multiplier'
    };
    try {
      await setDoc(doc(db, 'config', 'main'), { [fieldMap[key]]: value, updated_at: new Date().toISOString() }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'config/main');
    }
  };

  const addGasto = async (gastoData: Partial<Gasto>) => {
    const id = 'g' + Date.now();
    try {
      await setDoc(doc(db, 'gastos', id), { 
        ...gastoData, 
        id, 
        created_at: new Date().toISOString() 
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'gastos');
    }
  };

  const deleteGasto = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'gastos', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `gastos/${id}`);
    }
  };

  const saveMRRSnapshot = async () => {
    const id = 'mrr' + Date.now();
    try {
      await setDoc(doc(db, 'mrr_snapshots', id), {
        id,
        date: new Date().toISOString(),
        mrr: config.mrr,
        subscribers: config.subs,
        created_at: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'mrr_snapshots');
    }
  };

  const deleteMRR = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'mrr_snapshots', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `mrr_snapshots/${id}`);
    }
  };

  const addCustomTask = async (phase: number, taskData: any) => {
    const id = 'ct' + Date.now();
    try {
      await setDoc(doc(db, 'tasks', id), {
        ...taskData,
        id,
        phase,
        completed: false,
        is_custom: true,
        created_at: new Date().toISOString()
      });
      setIsAddingTask(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tasks');
    }
  };

  // --- HELPERS ---
  const fmt = (n: number) => (n || 0).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + '€';

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter(t => t.completed).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const totalSpent = gastos.reduce((acc, g) => acc + g.amount, 0);
    const valuation = (config.mrr || 0) * 12 * (config.multi || 10);
    
    const paulaTasks = tasks.filter(t => t.assignee === 'paula');
    const pabloTasks = tasks.filter(t => t.assignee === 'pablo');

    return { total, done, pct, totalSpent, valuation, paulaTasks, pabloTasks };
  }, [tasks, gastos, config]);

  const phaseStats = useMemo(() => {
    return [0, 1, 2, 3, 4].map(p => {
      const phaseTasks = tasks.filter(t => t.phase === p);
      const total = phaseTasks.length;
      const done = phaseTasks.filter(t => t.completed).length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      return { phase: p, total, done, pct };
    });
  }, [tasks]);

  const countdown = useMemo(() => {
    const t = new Date(config.launchDate);
    const n = new Date();
    const diff = Math.ceil((t.getTime() - n.getTime()) / (1000 * 60 * 60 * 24));
    return {
      days: diff > 0 ? diff : (diff === 0 ? 'HOY' : '-'),
      dateStr: t.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
    };
  }, [config.launchDate]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (filter === 'paula') return t.assignee === 'paula';
      if (filter === 'pablo') return t.assignee === 'pablo';
      if (filter === 'unassigned') return !t.assignee;
      if (filter === 'pending') return !t.completed;
      return true;
    });
  }, [tasks, filter]);

  const reportData = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + reportOffset);
    const key = d.getFullYear() + '-' + (d.getMonth() + 1).toString().padStart(2, '0');
    const label = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    
    const monthGastos = gastos.filter(g => g.date && g.date.slice(0, 7) === key);
    const total = monthGastos.reduce((acc, g) => acc + g.amount, 0);
    const paulaTotal = monthGastos.filter(g => g.payer === 'paula').reduce((acc, g) => acc + g.amount, 0);
    const pabloTotal = monthGastos.filter(g => g.payer === 'pablo').reduce((acc, g) => acc + g.amount, 0);

    const cats = ['infra', 'marketing', 'legal', 'tools', 'dev', 'otros'];
    const catTotals = cats.reduce((acc, c) => ({ ...acc, [c]: monthGastos.filter(g => g.category === c).reduce((a, g) => a + g.amount, 0) }), {} as any);
    const maxCat = Math.max(...Object.values(catTotals) as number[]);

    return { key, label, monthGastos, total, paulaTotal, pabloTotal, catTotals, maxCat };
  }, [gastos, reportOffset]);

  if (loading) return <div className="flex items-center justify-center h-screen text-zinc-500 font-mono">Cargando Zine Club Tracker...</div>;

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-[#09090B] text-zinc-100">
        <div className="max-w-md p-8 border border-white/10 rounded-2xl bg-zinc-900/50 backdrop-blur-xl">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-indigo-500/10 rounded-full text-indigo-400">
              <LayoutDashboard size={48} />
            </div>
          </div>
          <h1 className="font-serif text-3xl mb-4 tracking-tight">Zine Club Tracker</h1>
          <p className="text-zinc-400 mb-8 leading-relaxed">
            Inicia sesión para acceder al tracker compartido de Paula y Pablo.
          </p>
          <button 
            onClick={login}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2"
          >
            <Users size={18} />
            Entrar con Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32">
      {/* NAV */}
      <nav className="nav-tabs">
        <button className={`tab ${activeTab === 'dashboard' ? 'on' : ''}`} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
        <button className={`tab ${activeTab === 'roadmap' ? 'on' : ''}`} onClick={() => setActiveTab('roadmap')}>Roadmap</button>
        <button className={`tab ${activeTab === 'gastos' ? 'on' : ''}`} onClick={() => setActiveTab('gastos')}>Gastos</button>
        <button className={`tab ${activeTab === 'report' ? 'on' : ''}`} onClick={() => setActiveTab('report')}>Report mensual</button>
        <button className={`tab ${activeTab === 'mrr' ? 'on' : ''}`} onClick={() => setActiveTab('mrr')}>MRR & Valoracion</button>
        <button className="tab ml-auto text-zinc-500 hover:text-zinc-300" onClick={logout}>Salir</button>
      </nav>

      {/* DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div className="page on">
          <div className="hero">
            <div className="hero-top">
              <div>
                <div className="hero-brand">Zine Club — Tracker Maestro</div>
                <h1 className="hero-title">Todo lo que hay<br />que hacer, <span className="acc">paso a paso</span>,<br />hasta <span className="grn">venderla</span></h1>
                <p className="hero-sub">Marca tareas, registra gastos, actualiza tu MRR. El tracker calcula el progreso y la valoracion en tiempo real. Asigna cada tarea a Paula o Pablo.</p>
              </div>
              <div className="countdown-wrap">
                <div className="countdown-days">{countdown.days}</div>
                <div className="countdown-lbl">dias al lanzamiento</div>
                <div className="countdown-date">Objetivo: {countdown.dateStr}</div>
                <div className="mt-2.5">
                  <input 
                    type="date" 
                    className="bg-zinc-900 border border-zinc-800 rounded-md p-1 px-2 text-zinc-100 text-[11px] w-full outline-none"
                    value={config.launchDate}
                    onChange={(e) => saveConfig('launchDate', e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="global-stats">
              <div className="gs-card gs-acc">
                <div className="gs-val">{stats.pct}%</div>
                <div className="gs-lbl">Completado total</div>
                <div className="gs-sub">{stats.done} / {stats.total} tareas</div>
                <div className="prog-bar"><div className="prog-fill" style={{ width: `${stats.pct}%` }}></div></div>
              </div>
              <div className="gs-card gs-grn">
                <div className="gs-val">{fmt(config.mrr)}</div>
                <div className="gs-lbl">MRR actual</div>
                <div className="gs-sub">Objetivo: 6.500€</div>
                <div className="prog-bar"><div className="prog-fill grn" style={{ width: `${Math.min(100, (config.mrr / 6500) * 100)}%` }}></div></div>
              </div>
              <div className="gs-card gs-ylw">
                <div className="gs-val">{fmt(stats.totalSpent)}</div>
                <div className="gs-lbl">Invertido total</div>
                <div className="gs-sub">Acumulado desde inicio</div>
              </div>
              <div className="gs-card gs-prp">
                <div className="gs-val">{stats.valuation > 0 ? '~' + fmt(stats.valuation) : '-'}</div>
                <div className="gs-lbl">Valoracion estimada</div>
                <div className="gs-sub">MRR x 12 x multiplo</div>
              </div>
            </div>
          </div>

          <div className="px-7">
            <div className="sl">Progreso por fase</div>
            <div className="space-y-1.5">
              {phaseStats.map((st, i) => (
                <div key={i} className="bg-zinc-950 border border-white/5 rounded-xl p-3.5 px-4.5 flex items-center gap-3.5">
                  <div className="min-w-[160px]">
                    <div className="text-[12px] font-semibold">Fase {i}: {['Setup critico', 'Lanzamiento', 'Crecimiento', 'Escalado', 'Venta'][i]}</div>
                    <div className="font-mono text-[9px] text-zinc-500 mt-0.5">{st.done} / {st.total} tareas</div>
                  </div>
                  <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ 
                      width: `${st.pct}%`, 
                      background: ['linear-gradient(90deg,var(--acc),var(--acc2))', 'linear-gradient(90deg,var(--blu),#60a5fa)', 'linear-gradient(90deg,var(--grn),#4ade80)', 'linear-gradient(90deg,var(--prp),#c084fc)', 'linear-gradient(90deg,var(--ylw),#fcd34d)'][i] 
                    }}></div>
                  </div>
                  <div className="font-mono text-[12px] font-bold min-w-[34px] text-right" style={{ color: ['var(--acc2)', 'var(--blu)', 'var(--grn)', 'var(--prp)', 'var(--ylw)'][i] }}>{st.pct}%</div>
                </div>
              ))}
            </div>

            <div className="sl mt-7">Tareas por persona</div>
            <div className="grid grid-cols-2 gap-2.5 mb-7">
              <div className="bg-zinc-950 border border-pink-500/20 rounded-xl p-4 px-5 border-l-4 border-l-pink-400">
                <div className="font-mono text-[9px] text-pink-400 tracking-[2px] uppercase mb-2">Paula</div>
                <div className="font-serif text-[28px] tracking-tighter">{stats.paulaTasks.length}</div>
                <div className="text-[11px] text-zinc-500 mt-0.5">{stats.paulaTasks.filter(t => t.completed).length} hechas</div>
              </div>
              <div className="bg-zinc-950 border border-emerald-500/20 rounded-xl p-4 px-5 border-l-4 border-l-emerald-400">
                <div className="font-mono text-[9px] text-emerald-400 tracking-[2px] uppercase mb-2">Pablo</div>
                <div className="font-serif text-[28px] tracking-tighter">{stats.pabloTasks.length}</div>
                <div className="text-[11px] text-zinc-500 mt-0.5">{stats.pabloTasks.filter(t => t.completed).length} hechas</div>
              </div>
            </div>

            <div className="sl">Proximas tareas pendientes</div>
            <div className="space-y-1">
              {tasks.filter(t => !t.completed).slice(0, 6).map(t => (
                <div key={t.id} className="bg-zinc-950 border border-white/5 rounded-lg p-3 px-3.5 flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ['var(--acc2)', 'var(--blu)', 'var(--grn)', 'var(--prp)', 'var(--ylw)'][t.phase] }}></div>
                  <div className="flex-1 text-[12px] font-medium">{t.title}</div>
                  <div className="font-mono text-[9px] text-zinc-500">{t.date_label}</div>
                  <div className="font-mono text-[9px] px-2 py-0.5 bg-black/20 rounded-full" style={{ color: t.assignee === 'paula' ? 'var(--paula)' : t.assignee === 'pablo' ? 'var(--pablo)' : 'var(--t4)' }}>
                    {t.assignee ? (t.assignee === 'paula' ? 'Paula' : 'Pablo') : '-'}
                  </div>
                </div>
              ))}
              {tasks.filter(t => !t.completed).length === 0 && <div className="empty-tasks">Todas las tareas completadas!</div>}
            </div>
          </div>
        </div>
      )}

      {/* ROADMAP */}
      {activeTab === 'roadmap' && (
        <div className="page on">
          <div className="mb-5">
            <div className="font-serif text-[30px] tracking-tighter mb-1.5">Roadmap completo</div>
            <div className="text-[14px] text-zinc-400 mb-4">89 tareas con instrucciones paso a paso. Marca como hecha, asigna a Paula o Pablo.</div>
            <div className="filter-bar">
              <span className="font-mono text-[9px] text-zinc-500 tracking-[1.5px] uppercase">Filtrar:</span>
              <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Todas</button>
              <button className={`filter-btn f-paula ${filter === 'paula' ? 'active' : ''}`} onClick={() => setFilter('paula')}>
                <span className="filter-dot bg-pink-400"></span>Paula
              </button>
              <button className={`filter-btn f-pablo ${filter === 'pablo' ? 'active' : ''}`} onClick={() => setFilter('pablo')}>
                <span className="filter-dot bg-emerald-400"></span>Pablo
              </button>
              <button className={`filter-btn ${filter === 'unassigned' ? 'active' : ''}`} onClick={() => setFilter('unassigned')}>Sin asignar</button>
              <button className={`filter-btn ${filter === 'pending' ? 'active' : ''}`} onClick={() => setFilter('pending')}>Pendientes</button>
            </div>
          </div>

          {[0, 1, 2, 3, 4].map(p => {
            const st = phaseStats[p];
            const phaseTasks = filteredTasks.filter(t => t.phase === p);
            if (phaseTasks.length === 0 && filter !== 'all') return null;

            return (
              <div key={p} className="mb-9">
                <div className={`ph ${['ph-acc', 'ph-blu', 'ph-grn', 'ph-prp', 'ph-ylw'][p]}`}>
                  <div className="ph-eye">FASE {p} · {['SEMANA 1-2', 'SEMANA 2-3', 'MES 2-4', 'MES 5-9', 'MES 12-18'][p]}</div>
                  <h2>{['Setup critico', 'Lanzamiento', 'Crecimiento', 'Escalado', 'Venta'][p]}</h2>
                  <p className="ph-sub">{['La base sin la que nada funciona.', 'Testear con personas reales.', 'Escalar usuarios y patrocinadores.', 'B2B y preparar venta.', 'Marketplaces y compradores estrategicos.'][p]}</p>
                  <div className="ph-meta">
                    <span className="ph-badge mrr">MRR: {['0 → 50€', '50 → 400€', '400 → 2.000€', '2.000 → 5.000€', '5.000€+'][p]}</span>
                    <span className="ph-badge t">{['~20h total', '~12h total', '~8h/mes', '~6h/mes', 'Horizonte venta'][p]}</span>
                  </div>
                  <div className="ph-progress">
                    <div className="ph-prog-bar"><div className="ph-prog-fill" style={{ width: `${st.pct}%`, background: ['linear-gradient(90deg,var(--acc),var(--acc2))', 'linear-gradient(90deg,var(--blu),#60a5fa)', 'linear-gradient(90deg,var(--grn),#4ade80)', 'linear-gradient(90deg,var(--prp),#c084fc)', 'linear-gradient(90deg,var(--ylw),#fcd34d)'][p] }}></div></div>
                    <div className="ph-prog-pct" style={{ color: ['var(--acc2)', 'var(--blu)', 'var(--grn)', 'var(--prp)', 'var(--ylw)'][p] }}>{st.pct}%</div>
                  </div>
                </div>

                <div className="tasks mt-4">
                  {phaseTasks.map(t => (
                    <div key={t.id} className={`task ${t.completed ? 'done' : ''} ${t.assignee ? 'assigned-' + t.assignee : ''}`} onClick={() => toggleTask(t)}>
                      <div className="t-check">
                        <div className="t-check-box">
                          {t.completed && <Check size={11} strokeWidth={3} className="text-black" />}
                        </div>
                      </div>
                      <div className="t-date">{t.date_label}</div>
                      <div className="t-body">
                        <div className="t-title-row">
                          <div className="t-title">{t.title}</div>
                          <div className="t-assignee" onClick={(e) => e.stopPropagation()}>
                            <span className={`asgn-btn ${t.assignee === 'paula' ? 'active-paula' : ''}`} onClick={() => setAssignee(t.id, 'paula')}>P</span>
                            <span className={`asgn-btn ${t.assignee === 'pablo' ? 'active-pablo' : ''}`} onClick={() => setAssignee(t.id, 'pablo')}>Pa</span>
                          </div>
                        </div>
                        <div className="t-detail">{t.detail}</div>
                      </div>
                      <div className={`t-tool ${t.type}`}>{t.tool}</div>
                    </div>
                  ))}
                </div>

                {isAddingTask === p ? (
                  <div className="add-task-form open mt-2">
                    <div className="form-row">
                      <input id={`af${p}-title`} placeholder="Titulo de la tarea" />
                      <input id={`af${p}-date`} placeholder="Fecha / Semana" />
                    </div>
                    <textarea id={`af${p}-detail`} placeholder="Descripcion (opcional)"></textarea>
                    <div className="form-row">
                      <select id={`af${p}-type`}>
                        <option value="manual">Manual</option>
                        <option value="auto">Automatico</option>
                        <option value="dev">Dev/Tecnico</option>
                        <option value="crit">Critico</option>
                      </select>
                      <input id={`af${p}-tool`} placeholder="Herramienta" />
                      <select id={`af${p}-assignee`}>
                        <option value="">Sin asignar</option>
                        <option value="paula">Paula</option>
                        <option value="pablo">Pablo</option>
                      </select>
                    </div>
                    <div className="form-btns">
                      <button className="btn-cancel" onClick={() => setIsAddingTask(null)}>Cancelar</button>
                      <button className="btn-add" onClick={() => {
                        const title = (document.getElementById(`af${p}-title`) as HTMLInputElement).value;
                        const date = (document.getElementById(`af${p}-date`) as HTMLInputElement).value;
                        const detail = (document.getElementById(`af${p}-detail`) as HTMLTextAreaElement).value;
                        const type = (document.getElementById(`af${p}-type`) as HTMLSelectElement).value;
                        const tool = (document.getElementById(`af${p}-tool`) as HTMLInputElement).value;
                        const assignee = (document.getElementById(`af${p}-assignee`) as HTMLSelectElement).value;
                        if (title) addCustomTask(p, { title, date_label: date, detail, type, tool, assignee });
                      }}>Añadir tarea</button>
                    </div>
                  </div>
                ) : (
                  <div className="add-task-trigger" onClick={() => setIsAddingTask(p)}>+ Añadir tarea a Fase {p}</div>
                )}
                <div className="div"></div>
              </div>
            );
          })}
        </div>
      )}

      {/* GASTOS */}
      {activeTab === 'gastos' && (
        <div className="page on">
          <div className="mb-6">
            <div className="font-serif text-[30px] tracking-tighter mb-1.5">Registro de gastos</div>
            <div className="text-[14px] text-zinc-400">Anota cada euro que inviertes. El report mensual se genera automaticamente desde estos datos.</div>
          </div>

          <div className="cost-total-card">
            <div>
              <div className="text-[14px] font-semibold mb-0.5">Total invertido</div>
              <div className="text-[12px] text-zinc-500">Suma de todos los gastos registrados</div>
            </div>
            <div className="cost-total-val">{fmt(stats.totalSpent)}</div>
          </div>

          <div className="cost-stats-row">
            <div className="cost-stat"><div className="cost-stat-val text-red-500">{fmt(gastos.filter(g => g.type === 'unico').reduce((a, g) => a + g.amount, 0))}</div><div className="cost-stat-lbl">Pagos unicos</div></div>
            <div className="cost-stat"><div className="cost-stat-val text-amber-400">{fmt(gastos.filter(g => g.type === 'mensual').reduce((a, g) => a + g.amount, 0))}</div><div className="cost-stat-lbl">Recurrente/mes</div></div>
            <div className="cost-stat"><div className="cost-stat-val text-indigo-400">{fmt(gastos.filter(g => g.type === 'anual').reduce((a, g) => a + g.amount, 0))}</div><div className="cost-stat-lbl">Recurrente/año</div></div>
          </div>

          <div className="sl">Añadir gasto</div>
          <div className="gasto-form">
            <div className="gasto-grid">
              <div>
                <label className="field-lbl">Concepto</label>
                <input id="gConcepto" placeholder="ej: Namecheap dominio zineclub.io" />
              </div>
              <div>
                <label className="field-lbl">Importe (€)</label>
                <input id="gImporte" type="number" step="0.01" placeholder="30.00" />
              </div>
              <div>
                <label className="field-lbl">Categoria</label>
                <select id="gCat">
                  <option value="infra">Infraestructura</option>
                  <option value="marketing">Marketing / Ads</option>
                  <option value="legal">Legal / Marca</option>
                  <option value="tools">Herramientas</option>
                  <option value="dev">Desarrollo</option>
                  <option value="otros">Otros</option>
                </select>
              </div>
              <div>
                <label className="field-lbl">Tipo</label>
                <select id="gTipo">
                  <option value="unico">Pago unico</option>
                  <option value="mensual">Mensual</option>
                  <option value="anual">Anual</option>
                </select>
              </div>
              <button className="btn-primary" onClick={() => {
                const concept = (document.getElementById('gConcepto') as HTMLInputElement).value;
                const amount = parseFloat((document.getElementById('gImporte') as HTMLInputElement).value);
                const category = (document.getElementById('gCat') as HTMLSelectElement).value;
                const type = (document.getElementById('gTipo') as HTMLSelectElement).value;
                const date = (document.getElementById('gFecha') as HTMLInputElement).value;
                const payer = (document.getElementById('gPagador') as HTMLSelectElement).value;
                if (concept && amount) {
                  addGasto({ concept, amount, category, type, date, payer });
                  (document.getElementById('gConcepto') as HTMLInputElement).value = '';
                  (document.getElementById('gImporte') as HTMLInputElement).value = '';
                }
              }}>+ Añadir</button>
            </div>
            <div className="flex gap-2 items-center mt-1">
              <label className="field-lbl mb-0">Fecha:</label>
              <input id="gFecha" type="date" className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 px-2.5 text-zinc-100 text-[12px] outline-none w-auto" defaultValue={new Date().toISOString().slice(0, 10)} />
              <label className="field-lbl mb-0 ml-3">Pagado por:</label>
              <select id="gPagador" className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 px-2.5 text-zinc-100 text-[12px] outline-none">
                <option value="">Sin especificar</option>
                <option value="paula">Paula</option>
                <option value="pablo">Pablo</option>
              </select>
            </div>
          </div>

          <div className="sl">Historial de gastos</div>
          <div className="space-y-1">
            {gastos.map(g => (
              <div key={g.id} className="gasto-item">
                <div className="g-dot" style={{ background: { infra: 'var(--blu)', marketing: 'var(--org)', legal: 'var(--prp)', tools: 'var(--acc2)', dev: 'var(--ylw)', otros: 'var(--t3)' }[g.category] }}></div>
                <div className="g-date">{new Date(g.date + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                <div className="g-name">{g.concept} <span className="ml-2 text-[10px]" style={{ color: g.payer === 'paula' ? 'var(--paula)' : g.payer === 'pablo' ? 'var(--pablo)' : 'var(--t4)' }}>({g.payer || '-'})</span></div>
                <div className="g-cat-badge uppercase" style={{ background: { infra: 'var(--blu2)', marketing: 'var(--org2)', legal: 'var(--prp2)', tools: 'var(--acc4)', dev: 'var(--ylw2)', otros: 'var(--s3)' }[g.category], color: { infra: 'var(--blu)', marketing: 'var(--org)', legal: 'var(--prp)', tools: 'var(--acc2)', dev: 'var(--ylw)', otros: 'var(--t3)' }[g.category] }}>{g.category}</div>
                <div className="g-tipo-badge bg-zinc-800 text-zinc-500">{g.type}</div>
                <div className="g-amt">{fmt(g.amount)}</div>
                <button className="del-btn" onClick={() => deleteGasto(g.id)}><Trash2 size={12} /></button>
              </div>
            ))}
            {gastos.length === 0 && <div className="empty-tasks">Aun no hay gastos registrados.</div>}
          </div>
        </div>
      )}

      {/* REPORT */}
      {activeTab === 'report' && (
        <div className="page on">
          <div className="mb-6">
            <div className="font-serif text-[30px] tracking-tighter mb-1.5">Report mensual</div>
            <div className="text-[14px] text-zinc-400">Generado automaticamente desde tus gastos. Navega mes a mes para ver el historico completo.</div>
          </div>

          <div className="report-container">
            <div className="report-nav">
              <button className="report-nav-btn flex items-center gap-1" onClick={() => setReportOffset(prev => prev - 1)}><ChevronLeft size={14} /> Anterior</button>
              <div className="report-month-label capitalize">{reportData.label}</div>
              <button className="report-nav-btn flex items-center gap-1" onClick={() => setReportOffset(prev => Math.min(0, prev + 1))}>Siguiente <ChevronRight size={14} /></button>
              <button className="report-nav-btn ml-auto flex items-center gap-1" onClick={() => {
                const csv = 'Fecha,Concepto,Categoria,Tipo,Pagado por,Importe\n' + reportData.monthGastos.map(g => `${g.date},${g.concept.replace(/,/g, ' ')},${g.category},${g.type},${g.payer || '-'},${g.amount}`).join('\n');
                const a = document.createElement('a');
                a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
                a.download = `gastos_${reportData.key}.csv`;
                a.click();
              }}><Download size={14} /> Exportar CSV</button>
            </div>

            <div className="report-stats">
              <div className="report-stat"><div className="report-stat-val text-red-500">{fmt(reportData.total)}</div><div className="report-stat-lbl">Total del mes</div></div>
              <div className="report-stat"><div className="report-stat-val text-zinc-100">{reportData.monthGastos.length}</div><div className="report-stat-lbl">Num gastos</div></div>
              <div className="report-stat"><div className="report-stat-val text-pink-400">{fmt(reportData.paulaTotal)}</div><div className="report-stat-lbl">Paula</div></div>
              <div className="report-stat"><div className="report-stat-val text-emerald-400">{fmt(reportData.pabloTotal)}</div><div className="report-stat-lbl">Pablo</div></div>
            </div>

            <div className="sl">Desglose por categoria</div>
            <div className="report-cat-breakdown">
              {Object.entries(reportData.catTotals).filter(([_, val]) => (val as number) > 0).map(([cat, val]) => (
                <div key={cat} className="report-cat-item">
                  <div className="report-cat-name uppercase" style={{ color: { infra: 'var(--blu)', marketing: 'var(--org)', legal: 'var(--prp)', tools: 'var(--acc2)', dev: 'var(--ylw)', otros: 'var(--t3)' }[cat] }}>{cat}</div>
                  <div className="report-cat-val">{fmt(val as number)}</div>
                  <div className="report-bar"><div className="report-bar-fill" style={{ width: `${reportData.maxCat > 0 ? Math.round(((val as number) / reportData.maxCat) * 100) : 0}%`, background: { infra: 'var(--blu)', marketing: 'var(--org)', legal: 'var(--prp)', tools: 'var(--acc2)', dev: 'var(--ylw)', otros: 'var(--t3)' }[cat] }}></div></div>
                </div>
              ))}
              {reportData.monthGastos.length === 0 && <div className="text-zinc-500 text-[12px]">Sin gastos en este mes.</div>}
            </div>

            <div className="sl">Detalle de gastos</div>
            {reportData.monthGastos.length > 0 ? (
              <table className="report-table">
                <thead><tr><th>Fecha</th><th>Concepto</th><th>Categoria</th><th>Tipo</th><th>Pagado por</th><th className="text-right">Importe</th></tr></thead>
                <tbody>
                  {reportData.monthGastos.map(g => (
                    <tr key={g.id}>
                      <td>{new Date(g.date + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</td>
                      <td>{g.concept}</td>
                      <td className="cat-col uppercase" style={{ color: { infra: 'var(--blu)', marketing: 'var(--org)', legal: 'var(--prp)', tools: 'var(--acc2)', dev: 'var(--ylw)', otros: 'var(--t3)' }[g.category] }}>{g.category}</td>
                      <td className="capitalize">{g.type}</td>
                      <td style={{ color: g.payer === 'paula' ? 'var(--paula)' : g.payer === 'pablo' ? 'var(--pablo)' : 'var(--t3)' }}>{g.payer || '-'}</td>
                      <td className="amt-col">{fmt(g.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="report-empty">No hay gastos registrados en {reportData.label}.</div>
            )}

            {reportData.monthGastos.length > 0 && (
              <div className="report-summary-box">
                <div className="font-mono text-[9px] text-zinc-500 tracking-[1.5px] uppercase mb-2.5">Acumulado total (todos los meses)</div>
                <div className="report-summary-row"><span className="label">Total acumulado</span><span className="font-mono font-bold text-red-500">{fmt(stats.totalSpent)}</span></div>
                <div className="report-summary-row"><span className="label">Paula ha pagado</span><span className="font-mono text-pink-400">{fmt(gastos.filter(g => g.payer === 'paula').reduce((a, g) => a + g.amount, 0))}</span></div>
                <div className="report-summary-row"><span className="label">Pablo ha pagado</span><span className="font-mono text-emerald-400">{fmt(gastos.filter(g => g.payer === 'pablo').reduce((a, g) => a + g.amount, 0))}</span></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MRR */}
      {activeTab === 'mrr' && (
        <div className="page on">
          <div className="mb-6">
            <div className="font-serif text-[30px] tracking-tighter mb-1.5">MRR & Valoracion</div>
            <div className="text-[14px] text-zinc-400">Actualiza tu MRR y calcula la valoracion de venta en tiempo real.</div>
          </div>

          <div className="mrr-track">
            <div className="mrr-eyebrow">MRR actual — actualiza cuando quieras</div>
            <div className="flex gap-4 flex-wrap mb-4">
              <div className="mrr-field">
                <label>MRR actual (€/mes)</label>
                <input type="number" value={config.mrr} onChange={(e) => saveConfig('mrr', parseFloat(e.target.value) || 0)} placeholder="0" />
              </div>
              <div className="mrr-field">
                <label>Suscriptores premium</label>
                <input type="number" value={config.subs} onChange={(e) => saveConfig('subs', parseFloat(e.target.value) || 0)} placeholder="0" />
              </div>
              <div className="mrr-field">
                <label>Multiplo ARR</label>
                <input type="number" value={config.multi} onChange={(e) => saveConfig('multi', parseFloat(e.target.value) || 10)} placeholder="10" />
              </div>
            </div>
            <div className="mrr-valuation">
              <div>
                <div className="font-mono text-[9px] text-zinc-500 tracking-[2px] uppercase mb-1">Valoracion estimada</div>
                <div className="text-[12px] text-zinc-400">{fmt(config.mrr)}/mes x 12 x {config.multi}x = {fmt(stats.valuation)}</div>
              </div>
              <div className="mrr-val-num">{stats.valuation > 0 ? '~' + fmt(stats.valuation) : '0€'}</div>
            </div>
          </div>

          <div className="sl">Proyeccion MRR objetivo</div>
          <div className="mrr-track">
            <div className="mrr-eyebrow">Hoja de ruta de ingresos</div>
            <div className="mrr-row">
              <div className="mrr-step"><div className="mrr-v">0€</div><div className="mrr-p uppercase">Hoy</div></div>
              <div className="mrr-arr">→</div>
              <div className="mrr-step"><div className="mrr-v">50€</div><div className="mrr-p uppercase">Mes 1</div></div>
              <div className="mrr-arr">→</div>
              <div className="mrr-step"><div className="mrr-v">400€</div><div className="mrr-p uppercase">Mes 3</div></div>
              <div className="mrr-arr">→</div>
              <div className="mrr-step"><div className="mrr-v">2.000€</div><div className="mrr-p uppercase">Mes 6</div></div>
              <div className="mrr-arr">→</div>
              <div className="mrr-step"><div className="mrr-v">5.000€</div><div className="mrr-p uppercase">Mes 9</div></div>
              <div className="mrr-arr">→</div>
              <div className="mrr-step"><div className="mrr-v">6.500€+</div><div className="mrr-p uppercase">Mes 18</div></div>
            </div>
            <div className="mrr-total">
              <div>
                <div className="text-[13px] font-semibold mb-0.5">Valoracion objetivo en mes 18</div>
                <div className="text-[12px] text-zinc-500">6.500€/mes x 12 x 10x ARR. Con B2B puede superar 1M€</div>
              </div>
              <div className="font-serif text-[36px] text-emerald-400 tracking-tighter">~780.000€</div>
            </div>
          </div>

          <div className="sl">Historial MRR</div>
          <div className="space-y-1">
            {mrrHistory.map(s => (
              <div key={s.id} className="bg-zinc-950 border border-white/5 rounded-lg p-3 px-3.5 flex items-center gap-3.5">
                <div className="font-mono text-[11px] text-zinc-500 min-w-[110px]">{new Date(s.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                <div className="font-serif text-[22px] text-emerald-400 tracking-tighter">{fmt(s.mrr)}<span className="text-[12px] text-zinc-500 font-sans">/mes</span></div>
                <div className="flex-1 text-[12px] text-zinc-500">{s.subscribers} subs</div>
                <button onClick={() => deleteMRR(s.id)} className="del-btn"><Trash2 size={12} /></button>
              </div>
            ))}
            {mrrHistory.length === 0 && <div className="empty-tasks">Aun no has guardado ningun snapshot de MRR.</div>}
          </div>
          <button onClick={saveMRRSnapshot} className="mt-2.5 bg-zinc-900 border border-zinc-800 rounded-lg p-2 px-4 text-zinc-400 text-[13px] cursor-pointer hover:border-zinc-700 transition-colors">Guardar snapshot MRR actual</button>
        </div>
      )}
    </div>
  );
}
