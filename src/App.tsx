import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateEmail } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, Award, Bell, BriefcaseBusiness, Check, CheckCircle2,
  ChevronDown, ChevronRight, CircleHelp, Clock3, Download, FileCheck2, FileText, Filter, GraduationCap,
  LayoutDashboard, LogOut, Menu, Plus, Search, Settings2, ShieldCheck, Sparkles, Upload, UserRound, Users,
  Wallet, X, XCircle,
} from 'lucide-react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { auth, db, firebaseEnabled, storage } from './firebase'
import { demoProfile, initialState } from './demo'
import type { Application, AppState, Notification, Profile, Role, Scholarship, StudentDocument } from './types'

type Page = 'dashboard' | 'profile' | 'scholarships' | 'applications' | 'documents' | 'notifications' | 'review' | 'schemes' | 'reports'
type Identity = { id: string; name: string; email: string; role: Role }

const money = (value: number) => `₹${(value / 100000).toLocaleString('en-IN', { maximumFractionDigits: 1 })}L`
const formatDate = (value: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
const initials = (name: string) => name.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase()
const newId = () => `TS-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`
const firestoreDocumentId = (applicationId: string, name: string) => `${applicationId}_${encodeURIComponent(name)}`
const blankProfile = (name: string, email: string, mobile: string): Profile => ({
  ...demoProfile, fullName: name, email, mobile, dateOfBirth: '', gender: '', state: '', district: '',
  institution: '', course: '', educationLevel: '', yearOfStudy: '', cgpa: 0, income: 0,
  bankAccount: '', ifsc: '', tribe: '', category: '',
})

function useAppData() {
  const [data, setData] = useState<AppState>(() => {
    try {
      const stored = localStorage.getItem('tribal-scholar-state')
      return stored ? { ...initialState, ...JSON.parse(stored) as Partial<AppState> } : initialState
    } catch (error) {
      console.error('Could not read saved TribalScholar data.', error)
      return initialState
    }
  })
  useEffect(() => {
    localStorage.setItem('tribal-scholar-state', JSON.stringify(data))
  }, [data])
  return [data, setData] as const
}

function Brand({ small = false }: { small?: boolean }) {
  return <div className="brand"><span className="brand-icon"><GraduationCap size={small ? 20 : 23} /></span><span>TribalScholar<span className="brand-ai"> AI</span></span></div>
}

function StatusBadge({ status }: { status: string }) {
  const kind = status.toLowerCase().replaceAll(' ', '-')
  return <span className={`badge badge-${kind}`}><span className="badge-dot" />{status}</span>
}

function App() {
  const [data, setData] = useAppData()
  const [identity, setIdentity] = useState<Identity | null>(() => {
    if (firebaseEnabled) return null
    try { return JSON.parse(sessionStorage.getItem('tribal-scholar-user') ?? 'null') as Identity | null } catch { return null }
  })
  const [page, setPage] = useState<Page>('dashboard')
  const [selectedApplication, setSelectedApplication] = useState<string | null>(null)
  const [selectedScholarship, setSelectedScholarship] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [authView, setAuthView] = useState<'landing' | 'login' | 'register' | 'forgot'>('landing')
  const [loginRole, setLoginRole] = useState<Role>('student')
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 3600) }
  const updateData = useCallback((update: (current: AppState) => AppState) => setData(current => update(current)), [setData])
  const role = identity?.role
  const myApplications = useMemo(() => data.applications.filter(item => role === 'admin' || item.studentId === identity?.id || (identity?.id === 'demo-student' && item.studentId === 'demo-student')), [data.applications, identity, role])
  const myNotifications = data.notifications.filter(item => {
    if (item.role !== role) return false
    if (role === 'admin') return true
    if (!firebaseEnabled || identity?.id === 'demo-student') return !item.userId || item.userId === identity?.id
    return item.userId === identity?.id
  })
  const reviewedApplication = data.applications.find(item => item.applicationId === selectedApplication) ?? null
  const unreadCount = myNotifications.filter(item => !item.read).length

  useEffect(() => {
    if (identity) sessionStorage.setItem('tribal-scholar-user', JSON.stringify(identity))
    else sessionStorage.removeItem('tribal-scholar-user')
  }, [identity])

  useEffect(() => {
    const firestore = db
    const firebaseAuth = auth
    if (!firebaseEnabled || !firebaseAuth || !firestore) return
    return onAuthStateChanged(firebaseAuth, user => {
      if (!user) {
        setIdentity(current => current && !['demo-student', 'demo-admin'].includes(current.id) ? null : current)
        return
      }
      void (async () => {
        const claims = await user.getIdTokenResult()
        const accountRole: Role = claims.claims.admin === true ? 'admin' : 'student'
        const [studentDoc, scholarshipDocs, applicationDocs, notificationDocs] = await Promise.all([
          getDoc(doc(firestore, 'students', user.uid)),
          getDocs(collection(firestore, 'scholarships')),
          getDocs(accountRole === 'admin' ? collection(firestore, 'applications') : query(collection(firestore, 'applications'), where('studentId', '==', user.uid))),
          getDocs(accountRole === 'admin' ? query(collection(firestore, 'notifications'), where('role', '==', 'admin')) : query(collection(firestore, 'notifications'), where('userId', '==', user.uid))),
        ])
        if (firebaseAuth.currentUser?.uid !== user.uid) return
        const profile = studentDoc.exists()
          ? studentDoc.data() as Profile
          : accountRole === 'student' ? blankProfile('', user.email ?? '', '') : null
        const apps = applicationDocs.docs.map(item => item.data() as Application)
        const notices = notificationDocs.docs.map(item => item.data() as Notification)
        updateData(current => ({
          ...current,
          ...(profile ? { profile } : {}),
          ...(scholarshipDocs.size ? { scholarships: scholarshipDocs.docs.map(item => item.data() as Scholarship) } : {}),
          applications: [...current.applications.filter(item => item.demo), ...apps],
          notifications: [...current.notifications.filter(item => item.role === 'student' && !item.userId), ...notices],
        }))
        setIdentity({ id: user.uid, name: accountRole === 'admin' ? 'Ananya Sharma' : profile?.fullName ?? user.email?.split('@')[0] ?? 'Student', email: user.email ?? '', role: accountRole })
      })().catch(error => {
        console.error('Could not load the signed-in Firebase account.', error)
        setToast('Could not load your account data. Please try signing in again.')
        setIdentity(null)
      })
    })
  }, [firebaseEnabled, updateData])

  useEffect(() => {
    if (!firebaseEnabled || !db || !identity || !auth?.currentUser) return
    const userId = identity.id
    const isAdmin = identity.role === 'admin'
    const ownedApplications = data.applications.filter(item => isAdmin || item.studentId === userId)
    const ownedNotifications = data.notifications.filter(item => item.userId === userId || (isAdmin && item.role === 'admin'))
    const writes = [
      setDoc(doc(db, 'users', userId), { uid: userId, email: identity.email, role: isAdmin ? 'admin' : 'student' }, { merge: true }),
      ...ownedApplications.filter(item => !item.demo).map(item => setDoc(doc(db!, 'applications', item.applicationId), item)),
      ...ownedApplications.filter(item => !item.demo).flatMap(application => application.documents.map(document =>
        setDoc(doc(db!, 'documents', firestoreDocumentId(application.applicationId, document.name)), {
          ...document, applicationId: application.applicationId, studentId: application.studentId,
        }),
      )),
      ...ownedNotifications.map(item => setDoc(doc(db!, 'notifications', item.id), item)),
      ...(isAdmin ? data.scholarships.map(item => setDoc(doc(db!, 'scholarships', item.id), item)) : []),
      ...(!isAdmin ? [setDoc(doc(db, 'students', userId), data.profile)] : []),
    ]
    void Promise.all(writes).catch(error => {
      console.error('Could not sync TribalScholar data with Firestore.', error)
      setToast('Cloud sync failed. Your changes are still saved on this device.')
    })
  }, [data, identity])

  const loginDemo = async (accountRole: Role) => {
    if (auth?.currentUser) {
      try { await signOut(auth) }
      catch (error) {
        setAuthError(error instanceof Error ? error.message : 'Could not switch to the demo account.')
        return
      }
    }
    if (accountRole === 'student') updateData(current => ({ ...current, profile: demoProfile }))
    const account: Identity = accountRole === 'student'
      ? { id: 'demo-student', name: demoProfile.fullName, email: demoProfile.email, role: accountRole }
      : { id: 'demo-admin', name: 'Ananya Sharma', email: 'officer@tribalscholar.demo', role: accountRole }
    setIdentity(account)
    setPage('dashboard')
    setAuthError('')
  }

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    const name = String(form.get('name') ?? '').trim()
    const mobile = String(form.get('mobile') ?? '').trim()
    setAuthError('')
    setAuthBusy(true)
    try {
      if (authView === 'forgot') {
        if (!auth || !firebaseEnabled) throw new Error('Password reset needs a configured Firebase project. Use a demo account for now.')
        await sendPasswordResetEmail(auth, email)
        notify('Password reset link sent. Check your email.')
        setAuthView('login')
      } else if (authView === 'register') {
        if (auth && firebaseEnabled) {
          const result = await createUserWithEmailAndPassword(auth, email, password)
          const profile = blankProfile(name, email, mobile)
          updateData(current => ({ ...current, profile }))
          await Promise.all([
            setDoc(doc(db!, 'users', result.user.uid), { uid: result.user.uid, email, role: 'student' }),
            setDoc(doc(db!, 'students', result.user.uid), profile),
          ])
          setIdentity({ id: result.user.uid, name, email, role: 'student' })
        } else {
          if (password.length < 6) throw new Error('Password must be at least 6 characters.')
          const profile = blankProfile(name, email, mobile)
          updateData(current => ({ ...current, profile }))
          setIdentity({ id: `student-${Date.now()}`, name, email, role: 'student' })
          notify('Account created. Your demo profile is ready.')
        }
        setPage('dashboard')
      } else {
        if (auth && firebaseEnabled) {
          const result = await signInWithEmailAndPassword(auth, email, password)
          const claims = await result.user.getIdTokenResult()
          const accountRole: Role = claims.claims.admin === true ? 'admin' : 'student'
          if (accountRole !== loginRole) {
            await signOut(auth)
            throw new Error(`This account does not have ${loginRole === 'admin' ? 'officer' : 'student'} access.`)
          }
          setIdentity({ id: result.user.uid, name: accountRole === 'admin' ? 'Ananya Sharma' : email.split('@')[0], email, role: accountRole })
        } else {
          throw new Error('No Firebase project configured. Choose a demo account below.')
        }
        setPage('dashboard')
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed. Please try again.')
    } finally {
      setAuthBusy(false)
    }
  }

  const logout = async () => {
    try { if (auth?.currentUser) await signOut(auth) } catch (error) { notify(error instanceof Error ? error.message : 'Could not sign out.'); return }
    setIdentity(null)
    setSelectedApplication(null)
    setLoginRole('student')
    setAuthView('landing')
  }

  const updateApplication = (id: string, update: (application: Application) => Application) =>
    updateData(current => ({ ...current, applications: current.applications.map(item => item.applicationId === id ? update(item) : item) }))

  const addNotification = (targetRole: Role, message: string, detail: string, userId?: string) => {
    const owner = userId ?? (targetRole === identity?.role || (targetRole === 'admin' && identity?.role === 'student') ? identity.id : undefined)
    const item: Notification = { id: `n-${Date.now()}`, role: targetRole, ...(owner ? { userId: owner } : {}), message, detail, date: new Date().toISOString(), read: false }
    updateData(current => ({ ...current, notifications: [item, ...current.notifications] }))
  }

  const saveProfile = async (profile: Profile) => {
    if (auth?.currentUser && firebaseEnabled && profile.email !== auth.currentUser.email) {
      try { await updateEmail(auth.currentUser, profile.email) }
      catch (error) {
        notify(error instanceof Error ? error.message : 'Could not update your sign-in email.')
        return
      }
    }
    updateData(current => ({ ...current, profile }))
    if (identity) setIdentity({ ...identity, name: profile.fullName, email: profile.email })
    notify('Profile saved successfully.')
  }

  const uploadDocument = async (applicationId: string | undefined, name: string, file: File) => {
    let storagePath: string | undefined
    if (storage && identity && firebaseEnabled) {
      try {
        storagePath = `documents/${identity.id}/${applicationId ?? 'profile'}/${Date.now()}-${file.name}`
        await uploadBytes(ref(storage, storagePath), file)
      } catch (error) {
        notify(error instanceof Error ? `Upload failed: ${error.message}` : 'Document upload failed.')
        return
      }
    }
    if (applicationId) {
      const application = data.applications.find(item => item.applicationId === applicationId)
      if (!application) return
      const updatedDocuments = application.documents.map(document => document.name === name ? { ...document, status: 'Uploaded' as const, fileName: file.name, storagePath } : document)
      const isResubmission = application.status === 'Deficiency'
        && (!application.deficiency?.documentName || application.deficiency.documentName === name)
      updateApplication(applicationId, item => {
        const updated = { ...item }
        if (isResubmission) delete updated.deficiency
        return { ...updated, documents: updatedDocuments, status: isResubmission ? 'Resubmitted' : item.status, updatedAt: new Date().toISOString() }
      })
      if (isResubmission) addNotification('admin', 'Document resubmitted', `${application.studentName} — ${name}`)
    } else {
      notify(`${name} uploaded${storage ? ' to secure storage' : ' to this demo session'}.`)
    }
    notify(`${name} uploaded successfully.`)
  }

  const submitApplication = (scholarship: Scholarship, checks: Application['eligibilityChecks'], applicationProfile: Profile) => {
    if (!identity) return
    if (myApplications.some(item => item.scholarshipId === scholarship.id && item.studentId === identity.id)) {
      notify('You already have an application for this scholarship.')
      return
    }
    const applicationId = newId()
    const application: Application = {
      applicationId, studentId: identity.id, studentName: data.profile.fullName, scholarshipId: scholarship.id,
      scholarshipName: scholarship.name, profile: applicationProfile, eligibilityResult: checks.every(item => item.pass),
      eligibilityChecks: checks, status: 'Submitted',
      documents: scholarship.requiredDocuments.map(name => ({ name, status: 'Missing' })),
      submittedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }
    updateData(current => ({ ...current, applications: [application, ...current.applications] }))
    addNotification('admin', 'New application received', `${application.studentName} — ${scholarship.name}`)
    addNotification('student', 'Application submitted', `${scholarship.name} — ${applicationId}`, identity.id)
    setSelectedScholarship(null)
    setPage('applications')
    notify(`Application submitted: ${applicationId}`)
  }

  if (!identity) return <AuthScreen view={authView} setView={setAuthView} role={loginRole} setRole={setLoginRole} onSubmit={handleAuth} onDemo={loginDemo} busy={authBusy} error={authError} />

  const isAdmin = role === 'admin'
  const navItems: { id: Page; label: string; icon: ReactNode }[] = isAdmin
    ? [
        { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard /> },
        { id: 'applications', label: 'Applications', icon: <BriefcaseBusiness /> },
        { id: 'schemes', label: 'Scholarships', icon: <Award /> },
        { id: 'documents', label: 'Document verification', icon: <FileCheck2 /> },
        { id: 'notifications', label: 'Notifications', icon: <Bell /> },
        { id: 'reports', label: 'Reports', icon: <Activity /> },
      ]
    : [
        { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard /> },
        { id: 'profile', label: 'My profile', icon: <UserRound /> },
        { id: 'scholarships', label: 'Find scholarships', icon: <Search /> },
        { id: 'applications', label: 'My applications', icon: <BriefcaseBusiness /> },
        { id: 'documents', label: 'My documents', icon: <FileText /> },
        { id: 'notifications', label: 'Notifications', icon: <Bell /> },
      ]
  const greeting = isAdmin ? 'Officer workspace' : `Good morning, ${data.profile.fullName.split(' ')[0]}`

  const goToReview = (applicationId: string) => { setSelectedApplication(applicationId); setPage('review') }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand"><Brand /></div>
        <div className="nav-caption">{isAdmin ? 'OFFICER PORTAL' : 'STUDENT PORTAL'}</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map(item => <button key={item.id} className={`nav-link ${page === item.id || (page === 'review' && item.id === 'applications') ? 'nav-active' : ''}`} onClick={() => { setPage(item.id); setSelectedApplication(null); setMobileMenu(false) }}>
            {item.icon}<span>{item.label}</span>{item.id === 'notifications' && unreadCount > 0 && <span className="nav-count">{unreadCount}</span>}
          </button>)}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-help"><CircleHelp size={17} /><div><strong>Need a hand?</strong><span>We're here to help</span></div><ChevronRight size={16} /></div>
        <div className="sidebar-profile"><div className={`avatar ${isAdmin ? 'avatar-admin' : ''}`}>{initials(identity.name)}</div><div className="sidebar-user"><strong>{identity.name}</strong><span>{isAdmin ? 'Scholarship officer' : 'Student account'}</span></div><button className="icon-button sidebar-logout" aria-label="Sign out" onClick={logout}><LogOut size={17} /></button></div>
      </aside>
      {mobileMenu && <button aria-label="Close navigation" className="mobile-backdrop" onClick={() => setMobileMenu(false)} />}
      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Open navigation"><Menu /></button>
          <div className="breadcrumb">Home <ChevronRight size={14} /> <strong>{pageLabel(page, isAdmin)}</strong></div>
          <div className="top-actions"><div className="secure-indicator"><ShieldCheck size={16} /> Secure portal</div><button className="notification-button" aria-label="Notifications" onClick={() => setPage('notifications')}><Bell size={19} />{unreadCount > 0 && <i />}</button><button className="top-user" onClick={() => setPage(isAdmin ? 'dashboard' : 'profile')}><span className="avatar avatar-small">{initials(identity.name)}</span><ChevronDown size={15} /></button></div>
        </header>
        <div className="page-content">
          <div className="welcome-row"><div><div className="eyebrow">{isAdmin ? 'SCHOLARSHIP ADMINISTRATION' : 'STUDENT PORTAL'}</div><h1>{page === 'dashboard' ? greeting : page === 'review' ? pageLabel('review', isAdmin) : pageLabel(page)}</h1><p>{pageDescription(page, isAdmin)}</p></div>
            {page === 'applications' && !isAdmin && <button className="button button-primary" onClick={() => setPage('scholarships')}><Plus size={17} /> New application</button>}
            {page === 'schemes' && isAdmin && <button className="button button-primary" onClick={() => setSelectedScholarship('new')}><Plus size={17} /> Add scholarship</button>}
          </div>

          {page === 'dashboard' && (isAdmin
            ? <AdminDashboard applications={data.applications} scholarships={data.scholarships} onReview={goToReview} onNavigate={setPage} />
            : <StudentDashboard profile={data.profile} applications={myApplications} notifications={data.notifications.filter(item => item.role === 'student')} onNavigate={setPage} onReview={goToReview} />)}
          {page === 'profile' && !isAdmin && <ProfilePage profile={data.profile} onSave={saveProfile} />}
          {page === 'scholarships' && !isAdmin && <ScholarshipPage scholarships={data.scholarships} onSelect={setSelectedScholarship} applications={myApplications} />}
          {page === 'applications' && <ApplicationsPage applications={myApplications} isAdmin={isAdmin} onReview={goToReview} onNavigate={setPage} />}
          {page === 'documents' && <DocumentsPage applications={myApplications} isAdmin={isAdmin} onReview={goToReview} onUpload={uploadDocument} />}
          {page === 'notifications' && <NotificationsPage notifications={myNotifications} onRead={(id) => updateData(current => ({ ...current, notifications: current.notifications.map(item => item.id === id ? { ...item, read: true } : item) }))} />}
          {page === 'review' && isAdmin && reviewedApplication && <ReviewPage application={reviewedApplication} onBack={() => setPage('applications')}
            onVerify={(name) => { updateApplication(reviewedApplication.applicationId, item => ({ ...item, documents: item.documents.map(document => document.name === name ? { ...document, status: 'Verified' as const } : document), updatedAt: new Date().toISOString() })); addNotification('student', 'Document verified', `${name} — ${reviewedApplication.applicationId}`, reviewedApplication.studentId); notify(`${name} verified.`) }}
            onRejectDocument={(name) => { updateApplication(reviewedApplication.applicationId, item => ({ ...item, documents: item.documents.map(document => document.name === name ? { ...document, status: 'Rejected' as const } : document), updatedAt: new Date().toISOString() })); notify(`${name} marked for replacement.`) }}
            onDeficiency={(deficiency) => { updateApplication(reviewedApplication.applicationId, item => ({ ...item, status: 'Deficiency', deficiency, updatedAt: new Date().toISOString() }));             addNotification('student', 'Action required: deficiency raised', `${reviewedApplication.applicationId} — ${deficiency.message}`, reviewedApplication.studentId); notify('Deficiency sent to student.') }}
            onDecision={(status) => {
              if (['Approved', 'Rejected'].includes(reviewedApplication.status)) { notify('This application already has a final decision.'); return }
              const complete = reviewedApplication.eligibilityResult && reviewedApplication.documents.every(document => document.status === 'Verified')
              if (status === 'Approved' && !complete) { notify('Approval requires eligible status and all documents verified.'); return }
              if (!window.confirm(`${status === 'Approved' ? 'Approve' : 'Reject'} ${reviewedApplication.applicationId}?`)) return
              updateApplication(reviewedApplication.applicationId, item => ({ ...item, status, updatedAt: new Date().toISOString() }))
              addNotification('student', `Application ${status.toLowerCase()}`, `${reviewedApplication.scholarshipName} — ${reviewedApplication.applicationId}`, reviewedApplication.studentId)
              notify(`Application ${status.toLowerCase()}.`)
            }} />}
          {page === 'review' && !isAdmin && reviewedApplication && <StudentTrackingPage application={reviewedApplication} onBack={() => setPage('applications')} onDocuments={() => setPage('documents')} />}
          {page === 'review' && !isAdmin && !reviewedApplication && <EmptyState title="Application not found" detail="This application may have been removed." action={<button className="button button-secondary" onClick={() => setPage('applications')}>Back to applications</button>} />}
          {page === 'review' && isAdmin && !reviewedApplication && <EmptyState title="Application not found" detail="This application may have been removed." action={<button className="button button-secondary" onClick={() => setPage('applications')}>Back to applications</button>} />}
          {page === 'schemes' && isAdmin && <SchemeManagement scholarships={data.scholarships} onSave={(scheme) => { updateData(current => ({ ...current, scholarships: [scheme, ...current.scholarships.filter(item => item.id !== scheme.id)] })); setSelectedScholarship(null); notify('Scholarship saved.') }} onToggle={(id) => updateData(current => ({ ...current, scholarships: current.scholarships.map(item => item.id === id ? { ...item, active: !item.active } : item) }))} editingId={selectedScholarship} onEdit={setSelectedScholarship} />}
          {page === 'reports' && isAdmin && <ReportsPage applications={data.applications} />}
        </div>
      </main>
      {selectedScholarship && page === 'scholarships' && (() => {
        const scholarship = data.scholarships.find(item => item.id === selectedScholarship)
        return scholarship ? <ScholarshipModal scholarship={scholarship} profile={data.profile} onClose={() => setSelectedScholarship(null)} onApply={submitApplication} hasApplied={myApplications.some(item => item.scholarshipId === scholarship.id)} /> : null
      })()}
      {toast && <div role="status" className="toast"><CheckCircle2 size={18} />{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15} /></button></div>}
    </div>
  )
}

function pageLabel(page: Page, admin = false) {
  return ({ dashboard: 'Dashboard', profile: 'My profile', scholarships: 'Find scholarships', applications: 'My applications', documents: 'Documents', notifications: 'Notifications', review: admin ? 'Application review' : 'Application tracking', schemes: 'Scholarship management', reports: 'Reports' })[page]
}
function pageDescription(page: Page, admin: boolean) {
  if (page === 'dashboard') return admin ? 'Manage applications and support students through every step.' : 'Your journey to a brighter future starts right here.'
  return ({
    profile: 'Keep your personal and academic details up to date.',
    scholarships: 'Explore opportunities that match your goals and eligibility.',
    applications: 'Follow your application journey, all in one place.',
    documents: admin ? 'Review submitted documents and resolve verification queues.' : 'Keep your supporting documents organised and ready to apply.',
    notifications: 'Stay up to date on important updates and actions.',
    review: admin ? 'Review the student’s eligibility, documents, and application details.' : 'Follow each step in your scholarship application.',
    schemes: 'Configure scholarship opportunities and eligibility rules.',
    reports: 'A clear view of scholarship programme activity.',
  } as Record<Page, string>)[page]
}

function AuthScreen({ view, setView, role, setRole, onSubmit, onDemo, busy, error }: {
  view: 'landing' | 'login' | 'register' | 'forgot'; setView: (view: 'landing' | 'login' | 'register' | 'forgot') => void
  role: Role; setRole: (role: Role) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void; onDemo: (role: Role) => void; busy: boolean; error: string
}) {
  if (view === 'landing') return <LandingScreen onLogin={accountRole => { setRole(accountRole); setView('login') }} onDemo={onDemo} />
  return <div className="auth-shell">
    <header className="auth-top"><Brand /><span className="auth-secure"><ShieldCheck size={16} /> Government scholarship portal</span></header>
    <main className="auth-layout">
      <section className="auth-hero">
        <div className="hero-pill"><Sparkles size={15} /> Your future, within reach</div>
        <h1>Opportunity opens<br />new <span>possibilities.</span></h1>
        <p>Find scholarships made for your journey. One simple place to discover opportunities, apply with confidence, and follow your progress.</p>
        <div className="hero-highlights"><div><span className="highlight-icon"><Search size={18} /></span><span><strong>Discover opportunities</strong><small>Find the right support for your goals</small></span></div><div><span className="highlight-icon"><ShieldCheck size={18} /></span><span><strong>Know where you stand</strong><small>Clear eligibility and application updates</small></span></div></div>
        <div className="hero-decoration"><div className="decoration-sun" /><span className="decoration-leaf leaf-one" /><span className="decoration-leaf leaf-two" /><span className="decoration-hill hill-one" /><span className="decoration-hill hill-two" /><span className="decoration-star">✳</span></div>
        <div className="auth-photo-caption"><span>SUPPORTING EVERY STUDENT'S JOURNEY</span><span>Scholarships that go further <ArrowRight size={15} /></span></div>
      </section>
      <section className="auth-card-wrap">
        <div className="auth-card">
          <div className="auth-card-heading"><span className="auth-avatar"><UserRound size={21} /></span><span className="eyebrow">WELCOME TO TRIBALSCHOLAR</span><h2>{view === 'register' ? 'Create your account' : view === 'forgot' ? 'Reset your password' : role === 'admin' ? 'Officer sign in' : 'Good to see you'}</h2><p>{view === 'register' ? 'A few details are all it takes to get started.' : view === 'forgot' ? 'We’ll email you a link to reset your password.' : role === 'admin' ? 'Sign in to your scholarship officer workspace.' : 'Sign in to continue your scholarship journey.'}</p></div>
          {view === 'login' && <div className="auth-role-tabs" role="group" aria-label="Choose portal"><button type="button" aria-pressed={role === 'student'} className={role === 'student' ? 'auth-role-active' : ''} onClick={() => setRole('student')}><GraduationCap size={15} /> Student</button><button type="button" aria-pressed={role === 'admin'} className={role === 'admin' ? 'auth-role-active' : ''} onClick={() => setRole('admin')}><ShieldCheck size={14} /> Officer</button></div>}
          <form onSubmit={onSubmit} className="auth-form">
            {view === 'register' && <><FormInput name="name" label="Full name" placeholder="Enter your full name" required /><FormInput name="mobile" label="Mobile number" placeholder="+91 98765 43210" required pattern="[+0-9 ()-]{8,18}" /></>}
            <FormInput name="email" label="Email address" placeholder="you@example.com" type="email" required autoComplete="email" />
            {view !== 'forgot' && <div><div className="label-row"><label htmlFor="auth-password">Password</label>{view === 'login' && <button className="text-link" type="button" onClick={() => setView('forgot')}>Forgot password?</button>}</div><input className="input" id="auth-password" name="password" type="password" placeholder="Enter your password" minLength={6} required autoComplete={view === 'register' ? 'new-password' : 'current-password'} /></div>}
            {error && <div className="inline-error" role="alert"><CircleHelp size={16} />{error}</div>}
            <button className="button button-primary button-full" disabled={busy}>{busy ? 'Please wait…' : view === 'register' ? 'Create account' : view === 'forgot' ? 'Send reset link' : 'Sign in'}<ArrowRight size={17} /></button>
          </form>
          {view === 'login' && <><div className="divider"><span>QUICK DEMO ACCESS</span></div><div className="demo-buttons"><button onClick={() => onDemo('student')} className="demo-account"><span className="demo-avatar student-demo"><GraduationCap size={18} /></span><span><strong>Demo Student</strong><small>Rahul Kumar</small></span><ArrowRight size={17} /></button><button onClick={() => onDemo('admin')} className="demo-account"><span className="demo-avatar admin-demo"><ShieldCheck size={17} /></span><span><strong>Demo Admin</strong><small>Ananya Sharma · Officer</small></span><ArrowRight size={17} /></button></div></>}
          {view !== 'forgot' && <p className="auth-switch">{view === 'register' ? 'Already have an account?' : "New to TribalScholar?"} <button className="text-link" onClick={() => setView(view === 'register' ? 'login' : 'register')}>{view === 'register' ? 'Sign in' : 'Create account'}</button></p>}
          {view === 'forgot' && <p className="auth-switch"><button className="text-link" onClick={() => setView('login')}><ArrowLeft size={14} /> Back to sign in</button></p>}
        </div>
        <button className="auth-home-link" onClick={() => setView('landing')}><ArrowLeft size={13} /> Back to home</button>
        <div className="auth-footnote"><ShieldCheck size={15} /> Your information is securely handled and protected.</div>
      </section>
    </main>
    <footer className="auth-footer"><span>© 2026 TribalScholar AI · SIH26239 Prototype</span><span>Built for a brighter future <span className="footer-spark">✳</span></span></footer>
  </div>
}

function LandingScreen({ onLogin, onDemo }: { onLogin: (role: Role) => void; onDemo: (role: Role) => void }) {
  const steps = [
    { number: '01', icon: <Search size={19} />, title: 'Find your opportunity', detail: 'Browse scholarships built around your education, community, and ambitions.' },
    { number: '02', icon: <FileCheck2 size={19} />, title: 'Apply with confidence', detail: 'Check the clear eligibility rules, prepare your documents, and send your application.' },
    { number: '03', icon: <Activity size={19} />, title: 'Stay in the know', detail: 'Track each milestone and respond to requests from your dashboard.' },
  ]
  return <div className="landing-shell"><header className="landing-top"><Brand /><div className="landing-top-right"><span><ShieldCheck size={15} /> A secure scholarship portal</span><button className="button button-secondary" onClick={() => onLogin('admin')}>Officer login</button><button className="button button-primary" onClick={() => onLogin('student')}>Student login <ArrowRight size={15} /></button></div></header><main><section className="landing-hero"><div className="landing-copy"><span className="hero-pill landing-hero-pill"><Sparkles size={14} /> SUPPORTING STUDENT AMBITIONS</span><h1>Smart Scholarship<br />& Fellowship <span>Management</span></h1><p>Find the support that fits your journey. Discover scholarships, understand your eligibility, apply simply, and follow every step — all in one place.</p><div className="landing-actions"><button className="button button-primary" onClick={() => onLogin('student')}>Student login <ArrowRight size={16} /></button><button className="button button-secondary" onClick={() => onLogin('admin')}><ShieldCheck size={15} /> Admin login</button></div><button className="landing-demo-link" onClick={() => onDemo('student')}>Just exploring? <strong>Try the demo student account</strong> <ArrowRight size={13} /></button></div><div className="landing-art" aria-hidden="true"><div className="landing-art-orbit landing-orbit-one" /><div className="landing-art-orbit landing-orbit-two" /><span className="landing-art-spark landing-spark-one">✳</span><span className="landing-art-spark landing-spark-two">✦</span><span className="landing-art-sun" /><div className="landing-book"><GraduationCap size={71} strokeWidth={1.2} /></div><div className="landing-art-caption"><Award size={15} /> YOUR NEXT CHAPTER</div></div><div className="landing-trust"><span><ShieldCheck size={15} /> Clear, rule-based eligibility</span><i /><span><FileCheck2 size={15} /> Secure document handling</span><i /><span><Activity size={15} /> End-to-end application tracking</span></div></section><section className="landing-how"><div className="landing-section-title"><span className="eyebrow">A CLEARER PATH FORWARD</span><h2>Everything you need, every step of the way.</h2><p>Scholarship support, without the guesswork.</p></div><div className="landing-steps">{steps.map(step => <article className="landing-step" key={step.number}><span className="step-number">{step.number}</span><span className="step-icon">{step.icon}</span><h3>{step.title}</h3><p>{step.detail}</p></article>)}</div></section><section className="landing-callout"><span className="landing-callout-icon"><GraduationCap size={22} /></span><div><strong>A better way to reach your goals.</strong><p>Designed to make scholarship applications more transparent and accessible.</p></div><button className="text-link" onClick={() => onLogin('student')}>Get started <ArrowRight size={15} /></button></section></main><footer className="landing-footer"><span>© 2026 TribalScholar AI · SIH26239 Prototype</span><span>One more opportunity can change everything <span className="footer-spark">✳</span></span></footer></div>
}

function FormInput({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = props.id ?? props.name ?? `field-${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`
  return <div><label htmlFor={id}>{label}</label><input className="input" {...props} id={id} /></div>
}

function StudentDashboard({ profile, applications, notifications, onNavigate, onReview }: { profile: Profile; applications: Application[]; notifications: Notification[]; onNavigate: (page: Page) => void; onReview: (id: string) => void }) {
  const approved = applications.filter(item => item.status === 'Approved').length
  const pending = applications.filter(item => ['Submitted', 'Under Review', 'Resubmitted'].includes(item.status)).length
  const action = applications.filter(item => item.status === 'Deficiency').length
  return <div className="dashboard-stack">
    <section className="student-hero"><div className="student-hero-copy"><span className="hero-pill hero-pill-light"><Sparkles size={14} /> {profile.fullName.split(' ')[0].toUpperCase()}, YOUR NEXT CHAPTER STARTS HERE</span><h2>Your dreams deserve<br />the <span>right support.</span></h2><p>Discover funding opportunities that understand your journey. Every application takes you one step closer.</p><button className="button button-light" onClick={() => onNavigate('scholarships')}>Explore scholarships <ArrowRight size={17} /></button></div><div className="student-hero-art"><div className="hero-art-glow" /><div className="hero-art-circle"><Award size={53} strokeWidth={1.2} /></div><span className="art-star art-star-a">✳</span><span className="art-star art-star-b">✦</span><span className="art-orbit" /></div><span className="hero-art-caption">INVEST IN YOUR<br />POTENTIAL</span></section>
    <div className="section-heading"><div><h2>Your progress</h2><p>A little progress every day adds up.</p></div><span className={`updated-label ${action ? 'attention-label' : ''}`}><Activity size={14} />{action ? 'Action required' : pending ? 'Applications in progress' : 'All caught up'}</span></div>
    <div className="stats-grid">
      <StatCard label="Total applications" value={String(applications.length)} detail="Across all scholarships" icon={<BriefcaseBusiness />} color="blue" />
      <StatCard label="Approved" value={String(approved)} detail="Moving forward" icon={<CheckCircle2 />} color="green" />
      <StatCard label="In progress" value={String(pending)} detail="Being reviewed" icon={<Clock3 />} color="amber" />
      <StatCard label="Action needed" value={String(action)} detail="Needs your attention" icon={<ArrowDownRight />} color={action ? 'rose' : 'green'} />
    </div>
    <div className="dashboard-two-col">
      <section className="panel applications-panel"><div className="panel-heading"><div><h3>Recent applications</h3><p>Your latest scholarship activity</p></div><button className="text-link" onClick={() => onNavigate('applications')}>View all <ArrowRight size={14} /></button></div>
        {applications.length ? <div className="recent-list">{[...applications].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, 4).map(item => <button className="recent-item" key={item.applicationId} onClick={() => onReview(item.applicationId)}><span className="recent-icon"><Award size={18} /></span><span className="recent-description"><strong>{item.scholarshipName}</strong><small>{item.applicationId} · {formatDate(item.submittedAt)}</small></span><StatusBadge status={item.status} /><ChevronRight className="recent-chevron" size={16} /></button>)}</div> : <EmptyState title="No applications yet" detail="Find an opportunity that fits your journey." action={<button className="text-link" onClick={() => onNavigate('scholarships')}>Explore scholarships <ArrowRight size={14} /></button>} />}
      </section>
      <section className="panel notifications-panel"><div className="panel-heading"><div><h3>What's happening</h3><p>Recent updates for you</p></div><button className="icon-button panel-bell" onClick={() => onNavigate('notifications')} aria-label="All notifications"><Bell size={17} /></button></div>
        {notifications.length ? <div className="notification-list">{notifications.slice(0, 3).map(item => <div className="mini-notification" key={item.id}><span className={`notification-indicator ${item.read ? '' : 'unread'}`}><Bell size={14} /></span><div><strong>{item.message}</strong><p>{item.detail}</p><small>{relativeDate(item.date)}</small></div></div>)}</div> : <EmptyState title="You're all caught up" detail="New updates will show up here." />}
      </section>
    </div>
    <div className="quick-links"><button className="quick-link" onClick={() => onNavigate('scholarships')}><span className="quick-icon quick-blue"><Search size={19} /></span><span><strong>Find scholarships</strong><small>Explore your opportunities</small></span><ArrowRight size={17} /></button><button className="quick-link" onClick={() => onNavigate('profile')}><span className="quick-icon quick-purple"><UserRound size={19} /></span><span><strong>Update your profile</strong><small>Keep your details current</small></span><ArrowRight size={17} /></button><button className="quick-link" onClick={() => onNavigate('documents')}><span className="quick-icon quick-amber"><FileText size={19} /></span><span><strong>Manage documents</strong><small>Your documents, organised</small></span><ArrowRight size={17} /></button></div>
  </div>
}

function relativeDate(date: string) {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
  return days < 1 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`
}

function monthlyApplications(applications: Application[]) {
  const now = new Date()
  return Array.from({ length: 6 }, (_, index) => {
    const month = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1)
    return {
      month: new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(month),
      applications: applications.filter(item => {
        const submitted = new Date(item.submittedAt)
        return submitted.getFullYear() === month.getFullYear() && submitted.getMonth() === month.getMonth()
      }).length,
    }
  })
}

function StudentTrackingPage({ application, onBack, onDocuments }: { application: Application; onBack: () => void; onDocuments: () => void }) {
  const allVerified = application.documents.every(item => item.status === 'Verified')
  const decisionMade = ['Approved', 'Rejected'].includes(application.status)
  const events = [
    { title: 'Application submitted', detail: formatDate(application.submittedAt), complete: true },
    { title: 'Eligibility checked', detail: application.eligibilityResult ? 'Your application meets the published rules.' : 'Some eligibility rules were not met.', complete: true },
    { title: 'Documents under verification', detail: `${application.documents.filter(item => item.status === 'Verified').length} of ${application.documents.length} verified`, complete: allVerified || application.status === 'Deficiency' || application.status === 'Resubmitted' || decisionMade },
    ...(application.deficiency || application.status === 'Deficiency' ? [{ title: 'Action required', detail: application.deficiency?.message ?? 'Please check your required documents.', complete: false, action: true }] : []),
    ...(application.status === 'Resubmitted' ? [{ title: 'Documents resubmitted', detail: 'Your updated documents are with the review team.', complete: true }] : []),
    { title: 'Verification completed', detail: allVerified ? 'Your required documents have been verified.' : 'This step is still in progress.', complete: allVerified || decisionMade },
    { title: application.status === 'Approved' ? 'Application approved' : application.status === 'Rejected' ? 'Application not approved' : 'Final decision', detail: decisionMade ? `Decision recorded ${formatDate(application.updatedAt)}.` : 'Awaiting the officer’s decision.', complete: decisionMade },
  ]
  return <div className="student-tracking"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Back to applications</button><section className="panel tracking-overview"><div className="tracking-overview-heading"><span className="recent-icon"><Award size={20} /></span><div><span className="eyebrow">APPLICATION STATUS</span><h2>{application.scholarshipName}</h2><span className="mono-subtitle">{application.applicationId} · Submitted {formatDate(application.submittedAt)}</span></div><StatusBadge status={application.status} /></div>{application.status === 'Approved' && <div className="approved-banner"><CheckCircle2 size={19} /><div><strong>Application approved</strong><span>Congratulations! Your scholarship application has been approved.</span></div></div>}{application.deficiency && <div className="deficiency-note tracking-deficiency"><span className="deficiency-title"><Activity size={16} /> Action required · Due {formatDate(application.deficiency.deadline)}</span><strong>{application.deficiency.message}</strong><p>Reason: {application.deficiency.reason}</p><button className="button button-warning" onClick={onDocuments}><Upload size={15} /> Upload required document</button></div>}</section><div className="tracking-columns"><section className="panel tracking-timeline"><div className="panel-heading"><div><h3>Application journey</h3><p>We'll keep you updated as your application progresses.</p></div></div><div className="timeline student-timeline">{events.map((event, index) => <div className={`timeline-item ${event.complete ? 'timeline-complete' : ''}`} key={`${event.title}-${index}`}><span className="timeline-marker">{event.complete ? <Check size={12} /> : index + 1}</span><div className="tracking-event-copy"><strong>{event.title}</strong><small>{event.detail}</small></div></div>)}</div></section><aside className="panel tracking-documents"><div className="panel-heading"><div><h3>Required documents</h3><p>Submission and verification progress</p></div></div>{application.documents.map(item => <div className="tracking-document" key={item.name}><span className={`tracking-document-check ${item.status === 'Verified' ? 'tracking-document-verified' : ''}`}>{item.status === 'Verified' ? <Check size={12} /> : <FileText size={13} />}</span><span>{item.name}</span><StatusBadge status={item.status} /></div>)}<button className="button button-secondary button-full tracking-docs-button" onClick={onDocuments}>View and manage documents <ArrowRight size={15} /></button></aside></div></div>
}

function StatCard({ label, value, detail, icon, color }: { label: string; value: string; detail: string; icon: ReactNode; color: string }) {
  return <div className="stat-card"><span className={`stat-icon stat-${color}`}>{icon}</span><div className="stat-number">{value}</div><div className="stat-label">{label}</div><div className="stat-detail">{detail}</div></div>
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><FileText size={21} /></span><strong>{title}</strong><p>{detail}</p>{action}</div>
}

function ProfilePage({ profile, onSave }: { profile: Profile; onSave: (profile: Profile) => void }) {
  const [draft, setDraft] = useState(profile)
  const [editing, setEditing] = useState(false)
  useEffect(() => setDraft(profile), [profile])
  const set = (key: keyof Profile, value: string) => setDraft(current => ({ ...current, [key]: ['cgpa', 'income'].includes(key) ? Number(value) : value }))
  const field = (key: keyof Profile, label: string, type = 'text') => <div className="profile-field" key={key}><label htmlFor={`profile-${key}`}>{label}</label><input id={`profile-${key}`} className="input" disabled={!editing} min={key === 'cgpa' || key === 'income' ? 0 : undefined} max={key === 'cgpa' ? 10 : undefined} step={key === 'cgpa' ? '0.01' : undefined} type={type} value={draft[key]} onChange={event => set(key, event.target.value)} /></div>
  const section = (title: string, icon: ReactNode, fields: ReactNode[]) => <section className="panel profile-section"><div className="profile-section-heading"><span className="profile-section-icon">{icon}</span><h3>{title}</h3></div><div className="profile-fields">{fields}</div></section>
  return <form className="profile-layout" onSubmit={event => { event.preventDefault(); onSave(draft); setEditing(false) }}>
    <div className="profile-main">{section('Personal information', <UserRound size={18} />, [field('fullName', 'Full name'), field('dateOfBirth', 'Date of birth', 'date'), field('gender', 'Gender'), field('mobile', 'Mobile number'), field('email', 'Email address', 'email'), field('state', 'State'), field('district', 'District')])}
      {section('Education details', <GraduationCap size={19} />, [field('institution', 'Institution'), field('course', 'Course'), field('educationLevel', 'Education level'), field('yearOfStudy', 'Year of study'), field('cgpa', 'CGPA / percentage', 'number')])}
      {section('Financial information', <Wallet size={18} />, [field('income', 'Annual family income (₹)', 'number'), field('bankAccount', 'Bank account number'), field('ifsc', 'IFSC code')])}
      {section('Community and category', <Users size={18} />, [field('tribe', 'Tribe / community'), field('category', 'Category')])}
      <div className="form-actions">{editing && <button type="button" className="button button-secondary" onClick={() => { setDraft(profile); setEditing(false) }}>Cancel</button>}<button type={editing ? 'submit' : 'button'} className="button button-primary" onClick={() => !editing && setEditing(true)}>{editing ? <><Check size={16} /> Save profile</> : <><Settings2 size={16} /> Edit profile</>}</button></div>
    </div>
    <aside className="profile-aside"><div className="profile-card panel"><div className="profile-avatar-large">{initials(draft.fullName || 'Student')}</div><h3>{draft.fullName}</h3><p>{draft.email}</p><StatusBadge status="Profile active" /><div className="profile-completion"><div><span>Profile completion</span><strong>100%</strong></div><div className="completion-track"><span /></div><small>A complete profile helps us find your best-fit schemes.</small></div></div><div className="info-note"><ShieldCheck size={18} /><div><strong>Your information is protected</strong><p>Your profile is only used to assess applications and connect you with suitable opportunities.</p></div></div></aside>
  </form>
}

function ScholarshipPage({ scholarships, onSelect, applications }: { scholarships: Scholarship[]; onSelect: (id: string) => void; applications: Application[] }) {
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('All levels')
  const [category, setCategory] = useState('All categories')
  const [deadline, setDeadline] = useState('Any deadline')
  const matching = scholarships.filter(scheme => {
    const search = `${scheme.name} ${scheme.description} ${scheme.category}`.toLowerCase()
    const daysLeft = (new Date(`${scheme.deadline}T23:59:59`).getTime() - Date.now()) / 86400000
    return scheme.active && daysLeft >= 0 && search.includes(query.toLowerCase())
      && (level === 'All levels' || scheme.educationLevel === level)
      && (category === 'All categories' || scheme.category === category)
      && (deadline === 'Any deadline' || (deadline === 'Next 30 days' ? daysLeft <= 30 : daysLeft <= 90))
  })
  const categories = [...new Set(scholarships.map(item => item.category))]
  const levels = [...new Set(scholarships.map(item => item.educationLevel))]
  return <div className="scholarship-layout">
    <div className="scholarship-searchbar"><Search size={19} /><input aria-label="Search scholarships" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by scholarship name, course, or keyword..." /><span className="search-shortcut">⌘ K</span></div>
    <div className="filter-bar"><span className="filter-label"><Filter size={16} /> Filter by</span><select aria-label="Education level" className="select-control" value={level} onChange={event => setLevel(event.target.value)}><option>All levels</option>{levels.map(item => <option key={item}>{item}</option>)}</select><select aria-label="Category" className="select-control" value={category} onChange={event => setCategory(event.target.value)}><option>All categories</option>{categories.map(item => <option key={item}>{item}</option>)}</select><select aria-label="Deadline" className="select-control" value={deadline} onChange={event => setDeadline(event.target.value)}><option>Any deadline</option><option>Next 30 days</option><option>Next 90 days</option></select><span className="filter-results">{matching.length} opportunities</span></div>
    <div className="scholarship-grid">{matching.map((scheme, index) => {
      const applied = applications.some(item => item.scholarshipId === scheme.id)
      return <article className={`scheme-card scheme-card-${index % 3}`} key={scheme.id}><div className="scheme-card-top"><span className={`scheme-icon scheme-icon-${index % 3}`}><Award size={21} /></span><span className="scheme-open"><span /> Open</span></div><h3>{scheme.name}</h3><p className="scheme-description">{scheme.description}</p><div className="scheme-payout"><span>Potential support</span><strong>{scheme.benefits.split(' ').slice(0, 3).join(' ')}</strong></div><div className="scheme-criteria"><div><span>Family income</span><strong>Up to {money(scheme.maxIncome)}</strong></div><div><span>Minimum CGPA</span><strong>{scheme.minCgpa} / 10</strong></div><div><span>Education level</span><strong>{scheme.educationLevel}</strong></div><div><span>Deadline</span><strong className="deadline-text">{formatDate(scheme.deadline)}</strong></div></div><div className="scheme-card-actions"><button className="button button-secondary" onClick={() => onSelect(scheme.id)}>View details</button><button disabled={applied} className="button button-primary" onClick={() => onSelect(scheme.id)}>{applied ? 'Applied' : 'Check eligibility'}<ArrowRight size={15} /></button></div></article>
    })}</div>
    {matching.length === 0 && <EmptyState title="No matching scholarships" detail="Try adjusting your search or filters." action={<button className="button button-secondary" onClick={() => { setQuery(''); setLevel('All levels'); setCategory('All categories'); setDeadline('Any deadline') }}>Clear filters</button>} />}
  </div>
}

function runEligibility(profile: Profile, scholarship: Scholarship) {
  return [
    { label: 'CGPA', actual: String(profile.cgpa), requirement: `≥ ${scholarship.minCgpa}`, pass: profile.cgpa >= scholarship.minCgpa },
    { label: 'Family income', actual: money(profile.income), requirement: `≤ ${money(scholarship.maxIncome)}`, pass: profile.income <= scholarship.maxIncome },
    { label: 'Category', actual: profile.category, requirement: scholarship.category, pass: scholarship.category === 'Any' || profile.category.toLowerCase() === scholarship.category.toLowerCase() },
    { label: 'Education level', actual: profile.educationLevel, requirement: scholarship.educationLevel, pass: scholarship.educationLevel === 'Any' || profile.educationLevel.toLowerCase() === scholarship.educationLevel.toLowerCase() },
  ]
}

function ScholarshipModal({ scholarship, profile, onClose, onApply, hasApplied }: {
  scholarship: Scholarship; profile: Profile; onClose: () => void
  onApply: (scholarship: Scholarship, checks: Application['eligibilityChecks'], profile: Profile) => void; hasApplied: boolean
}) {
  const checks = runEligibility(profile, scholarship)
  const eligible = checks.every(item => item.pass)
  const [checked, setChecked] = useState(false)
  const [showApplicationForm, setShowApplicationForm] = useState(false)
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="modal scholarship-modal" role="dialog" aria-modal="true" aria-labelledby="scholarship-modal-title">
    <div className="modal-top"><span className="modal-icon"><Award size={22} /></span><button className="icon-button" onClick={onClose} aria-label="Close details"><X size={20} /></button></div>
    <span className="eyebrow">SCHOLARSHIP OPPORTUNITY</span><h2 id="scholarship-modal-title">{scholarship.name}</h2><p className="modal-description">{scholarship.description}</p>
    <div className="modal-benefit"><Wallet size={19} /><div><span>Scholarship benefits</span><strong>{scholarship.benefits}</strong></div></div>
    <div className="modal-two-col"><div><span className="modal-label">APPLICATION DEADLINE</span><strong>{formatDate(scholarship.deadline)}</strong></div><div><span className="modal-label">EDUCATION LEVEL</span><strong>{scholarship.educationLevel}</strong></div></div>
    <div className="modal-criteria-title"><h3>Eligibility criteria</h3><span>Transparent, rule-based check</span></div>
    <div className="eligibility-table">{checks.map(item => <div className="eligibility-row" key={item.label}><span>{item.label}</span><strong>{item.actual}</strong><span>{item.requirement}</span><StatusBadge status={item.pass ? 'PASS' : 'FAIL'} /></div>)}</div>
    <div className={`eligibility-result ${eligible ? 'result-pass' : 'result-fail'}`}>{eligible ? <CheckCircle2 size={20} /> : <XCircle size={20} />}<div><strong>{checked ? eligible ? 'You’re eligible to apply' : 'Some criteria are not met' : 'Ready to check your eligibility?'}</strong><span>{checked ? eligible ? 'Congratulations! You meet the current eligibility criteria.' : `Please review: ${checks.filter(item => !item.pass).map(item => item.label).join(', ')}.` : 'Your profile is compared against the published scheme rules.'}</span></div><button className="text-link" onClick={() => setChecked(true)}>{checked ? 'Recheck' : 'Check now'}</button></div>
    <div className="required-docs"><h3>Documents you’ll need</h3><div>{scholarship.requiredDocuments.map(item => <span key={item}><FileText size={14} />{item}</span>)}</div></div>
    {showApplicationForm && eligible && <ApplicationForm profile={profile} onSubmit={applicationProfile => { if (window.confirm(`Submit an application for ${scholarship.name}?`)) onApply(scholarship, checks, applicationProfile) }} onCancel={() => setShowApplicationForm(false)} />}
    {!showApplicationForm && <div className="modal-actions"><button className="button button-secondary" onClick={onClose}>Close</button><button disabled={!eligible || hasApplied} className="button button-primary" onClick={() => { if (!checked) { setChecked(true); return }; setShowApplicationForm(true) }}>{hasApplied ? 'Already applied' : checked ? 'Apply now' : 'Check eligibility'}<ArrowRight size={16} /></button></div>}
  </section></div>
}

function ApplicationForm({ profile, onSubmit, onCancel }: { profile: Profile; onSubmit: (profile: Profile) => void; onCancel: () => void }) {
  const groups: { title: string; fields: [keyof Profile, string, string?][] }[] = [
    { title: 'Personal details', fields: [['fullName', 'Full name'], ['dateOfBirth', 'Date of birth', 'date'], ['gender', 'Gender'], ['mobile', 'Mobile number'], ['email', 'Email address', 'email'], ['state', 'State'], ['district', 'District']] },
    { title: 'Education', fields: [['institution', 'Institution'], ['course', 'Course'], ['educationLevel', 'Education level'], ['yearOfStudy', 'Year of study'], ['cgpa', 'CGPA / percentage']] },
    { title: 'Financial and category details', fields: [['income', 'Annual family income (₹)'], ['bankAccount', 'Bank account number'], ['ifsc', 'IFSC'], ['tribe', 'Tribe / community'], ['category', 'Category']] },
  ]
  return <form className="application-form" onSubmit={event => { event.preventDefault(); onSubmit(profile) }}><div className="application-form-heading"><div><h3>Review your application</h3><p>These details are prefilled from your profile. To make changes, update your profile first.</p></div></div>{groups.map(group => <fieldset className="application-details-group" key={group.title}><legend>{group.title}</legend><div className="application-details-grid">{group.fields.map(([key, label, type]) => { const id = `application-${key}`; return <div key={key}><label htmlFor={id}>{label}</label><input className="input" id={id} max={key === 'cgpa' ? 10 : undefined} min={['cgpa', 'income'].includes(key) ? 0 : undefined} readOnly required step={key === 'cgpa' ? '0.01' : undefined} type={type ?? (['cgpa', 'income'].includes(key) ? 'number' : 'text')} value={profile[key]} /></div> })}</div></fieldset>)}<label className="declaration-check"><input required type="checkbox" /><span>I confirm that the information provided is accurate.</span></label><div className="application-form-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Back</button><button type="submit" className="button button-primary">Submit application <ArrowRight size={15} /></button></div></form>
}

function ApplicationsPage({ applications, isAdmin, onReview, onNavigate }: { applications: Application[]; isAdmin: boolean; onReview: (id: string) => void; onNavigate: (page: Page) => void }) {
  const [filter, setFilter] = useState('All')
  const [query, setQuery] = useState('')
  const filters = isAdmin ? ['All', 'Pending', 'Eligible', 'Deficiency', 'Approved', 'Rejected'] : ['All', 'Under Review', 'Deficiency', 'Approved', 'Rejected']
  const visible = applications.filter(item => {
    const matchesFilter = filter === 'All' || (filter === 'Pending' ? ['Submitted', 'Under Review', 'Resubmitted'].includes(item.status) : filter === 'Eligible' ? item.eligibilityResult : item.status.toLowerCase() === filter.toLowerCase())
    return matchesFilter && `${item.applicationId} ${item.studentName} ${item.scholarshipName}`.toLowerCase().includes(query.toLowerCase())
  }).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
  return <div className="panel table-panel"><div className="table-toolbar"><div className="filter-tabs">{filters.map(item => <button key={item} className={filter === item ? 'filter-tab active-tab' : 'filter-tab'} onClick={() => setFilter(item)}>{item}{item === 'Deficiency' && applications.filter(application => application.status === 'Deficiency').length > 0 && <span>{applications.filter(application => application.status === 'Deficiency').length}</span>}</button>)}</div><div className="table-search"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={isAdmin ? 'Search name or application ID' : 'Search applications'} /></div></div>
    <div className="table-scroll"><table><thead><tr>{isAdmin && <th>APPLICATION ID</th>}<th>STUDENT</th><th>SCHOLARSHIP</th><th>SUBMITTED</th><th>ELIGIBILITY</th><th>STATUS</th><th /></tr></thead><tbody>{visible.map(item => <tr key={item.applicationId}>{isAdmin && <td className="mono-cell">{item.applicationId}</td>}<td><span className="table-person"><span className="avatar avatar-small">{initials(item.studentName)}</span><strong>{item.studentName}</strong></span>{!isAdmin && <small className="table-id">{item.applicationId}</small>}</td><td><strong className="table-scheme">{item.scholarshipName}</strong></td><td>{formatDate(item.submittedAt)}</td><td><span className={`eligibility-label ${item.eligibilityResult ? 'eligibility-yes' : 'eligibility-no'}`}><span />{item.eligibilityResult ? 'Eligible' : 'Not eligible'}</span></td><td><StatusBadge status={item.status} /></td><td><button className="button button-table" onClick={() => onReview(item.applicationId)}>{isAdmin ? 'Review' : 'Track'}<ArrowRight size={14} /></button></td></tr>)}</tbody></table></div>
    {visible.length === 0 && <EmptyState title={applications.length ? 'No matching applications' : 'No applications yet'} detail={applications.length ? 'Try another filter or search term.' : 'Explore scholarships and submit your first application.'} action={!isAdmin && <button className="text-link" onClick={() => onNavigate('scholarships')}>Find scholarships <ArrowRight size={14} /></button>} />}
    <div className="table-footer">Showing {visible.length} of {applications.length} applications <span>Updated just now</span></div>
  </div>
}

function DocumentsPage({ applications, isAdmin, onReview, onUpload }: { applications: Application[]; isAdmin: boolean; onReview: (id: string) => void; onUpload: (applicationId: string | undefined, name: string, file: File) => void }) {
  const [selected, setSelected] = useState(applications[0]?.applicationId ?? '')
  useEffect(() => { if (!applications.some(item => item.applicationId === selected)) setSelected(applications[0]?.applicationId ?? '') }, [applications, selected])
  const application = applications.find(item => item.applicationId === selected)
  if (!applications.length) return <EmptyState title="No documents to show" detail="Your required documents will appear here after you apply." />
  return <div className="documents-layout"><div className="panel documents-main"><div className="panel-heading"><div><h3>{isAdmin ? 'Document verification queue' : 'Your supporting documents'}</h3><p>{isAdmin ? 'Select an application to review its documents.' : 'Upload a clear scan or photo of each required document.'}</p></div></div>
    <div className="document-app-select"><label htmlFor="document-application">Application</label><select id="document-application" className="select-control" value={selected} onChange={event => setSelected(event.target.value)}>{applications.map(item => <option value={item.applicationId} key={item.applicationId}>{item.applicationId} · {item.scholarshipName}</option>)}</select></div>
    {application && <div className="document-rows">{application.documents.map(document => <DocumentRow key={document.name} application={application} document={document} isAdmin={isAdmin} onReview={onReview} onUpload={onUpload} />)}</div>}
  </div><aside className="document-aside"><div className="document-tip panel"><span className="tip-icon"><ShieldCheck size={21} /></span><h3>Upload with confidence</h3><p>Files are for scholarship verification only. Keep images clear and make sure all text is readable.</p><div className="tip-check"><CheckCircle2 size={16} /> PDF, JPG or PNG</div><div className="tip-check"><CheckCircle2 size={16} /> Up to 10 MB per document</div><div className="tip-check"><CheckCircle2 size={16} /> Never share OTPs or passwords</div></div>{application?.deficiency && <div className="deficiency-note"><span className="deficiency-title"><Activity size={16} /> Action required</span><strong>{application.deficiency.message}</strong><p>Reason: {application.deficiency.reason}</p><p>Deadline: {formatDate(application.deficiency.deadline)}</p></div>}</aside></div>
}

function DocumentRow({ application, document, isAdmin, onReview, onUpload }: { application: Application; document: StudentDocument; isAdmin: boolean; onReview: (id: string) => void; onUpload: (applicationId: string | undefined, name: string, file: File) => void }) {
  const inputId = `upload-${application.applicationId}-${document.name.replaceAll(/[^a-zA-Z0-9]/g, '-')}`
  const [downloadUrl, setDownloadUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const openFile = async () => {
    if (!document.storagePath || !storage) return
    setLoading(true)
    try { setDownloadUrl(await getDownloadURL(ref(storage, document.storagePath))) }
    catch (error) { console.error('Could not get the document download URL.', error) }
    finally { setLoading(false) }
  }
  return <div className="document-row"><span className={`document-file-icon ${document.status === 'Missing' ? 'document-missing' : ''}`}><FileText size={19} /></span><div className="document-info"><strong>{document.name}</strong><small>{document.fileName ?? (document.status === 'Missing' ? 'Required document' : 'No file attached')}</small></div><StatusBadge status={document.status} />{downloadUrl && <a className="icon-button" href={downloadUrl} target="_blank" rel="noreferrer" aria-label={`Open ${document.name}`}><Download size={17} /></a>}{document.storagePath && !downloadUrl && <button className="icon-button" disabled={loading} onClick={openFile} aria-label={`View ${document.name}`}><Download size={17} /></button>}
    {isAdmin ? <button className="button button-table" onClick={() => onReview(application.applicationId)}>Review</button> : <label className={`button button-table upload-label ${document.status === 'Verified' ? 'button-uploaded' : ''}`} htmlFor={inputId}>{document.status === 'Missing' || document.status === 'Rejected' ? <Upload size={14} /> : <Check size={14} />}{document.status === 'Missing' || document.status === 'Rejected' ? document.status === 'Rejected' ? 'Replace' : 'Upload' : document.status === 'Verified' ? 'Verified' : 'Replace'}<input id={inputId} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={event => { const file = event.target.files?.[0]; if (file) { if (file.size > 10 * 1024 * 1024) { window.alert('Choose a file smaller than 10 MB.'); event.target.value = ''; return } onUpload(application.applicationId, document.name, file) } }} /></label>}
  </div>
}

function NotificationsPage({ notifications, onRead }: { notifications: Notification[]; onRead: (id: string) => void }) {
  return <div className="panel full-notifications"><div className="panel-heading"><div><h3>Recent updates</h3><p>Important news about your scholarship journey.</p></div></div>{notifications.length ? <div className="full-notification-list">{notifications.map(item => <button className={`full-notification ${item.read ? '' : 'notification-unread'}`} key={item.id} onClick={() => onRead(item.id)}><span className="notification-icon"><Bell size={18} /></span><span className="full-notification-content"><strong>{item.message}</strong><p>{item.detail}</p><small>{formatDate(item.date)} · {relativeDate(item.date)}</small></span>{!item.read && <span className="unread-tag">NEW</span>}</button>)}</div> : <EmptyState title="You're all caught up" detail="New messages will show up here." />}</div>
}

function ReviewPage({ application, onBack, onVerify, onRejectDocument, onDeficiency, onDecision }: {
  application: Application; onBack: () => void
  onVerify: (name: string) => void; onRejectDocument: (name: string) => void
  onDeficiency: (deficiency: NonNullable<Application['deficiency']>) => void; onDecision: (status: 'Approved' | 'Rejected') => void
}) {
  const [showDeficiency, setShowDeficiency] = useState(false)
  const [reason, setReason] = useState('Missing document')
  const [message, setMessage] = useState('')
  const [deadline, setDeadline] = useState(() => new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10))
  const [documentName, setDocumentName] = useState(() => application.documents.find(item => item.status === 'Missing' || item.status === 'Rejected')?.name ?? application.documents[0]?.name ?? '')
  const verified = application.documents.every(item => item.status === 'Verified')
  const approveReady = application.eligibilityResult && verified
  const decisionMade = ['Approved', 'Rejected'].includes(application.status)
  const profile = application.profile
  const timeline = [
    ['Application submitted', application.submittedAt, true],
    ['Eligibility checked', application.submittedAt, true],
    ['Documents under verification', application.updatedAt, ['Under Review', 'Resubmitted', 'Deficiency', 'Approved'].includes(application.status)],
    ['Verification completed', application.updatedAt, verified],
    ['Final decision', application.updatedAt, ['Approved', 'Rejected'].includes(application.status)],
  ] as const
  return <div className="review-page"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Back to applications</button>
    <div className="review-title-row"><div><span className="eyebrow">APPLICATION REVIEW</span><h2>{application.scholarshipName}</h2><span className="mono-subtitle">{application.applicationId} · Submitted {formatDate(application.submittedAt)}</span></div><StatusBadge status={application.status} /></div>
    <div className="review-columns"><div className="review-main">
      <section className="panel review-section"><div className="panel-heading"><div><h3>Student information</h3><p>Personal and academic profile as submitted</p></div></div><div className="student-review-card"><span className="avatar review-avatar">{initials(application.studentName)}</span><div><h4>{application.studentName}</h4><p>{profile.email} · {profile.mobile}</p></div><div className="review-field"><small>COMMUNITY</small><strong>{profile.tribe} · {profile.category}</strong></div></div><div className="review-data-grid"><ReviewField label="Institution" value={profile.institution} /><ReviewField label="Course / level" value={`${profile.course} · ${profile.educationLevel}`} /><ReviewField label="Year of study" value={profile.yearOfStudy} /><ReviewField label="CGPA" value={`${profile.cgpa} / 10`} /><ReviewField label="Annual family income" value={money(profile.income)} /><ReviewField label="District, state" value={`${profile.district}, ${profile.state}`} /></div></section>
      <section className="panel review-section"><div className="panel-heading"><div><h3>Eligibility assessment</h3><p>Each scheme rule is checked against the submitted profile.</p></div><StatusBadge status={application.eligibilityResult ? 'ELIGIBLE' : 'Not eligible'} /></div><div className="eligibility-table review-eligibility">{application.eligibilityChecks.map(item => <div key={item.label} className="eligibility-row"><span>{item.label}</span><strong>{item.actual}</strong><span>{item.requirement}</span><StatusBadge status={item.pass ? 'PASS' : 'FAIL'} /></div>)}</div></section>
      <section className="panel review-section"><div className="panel-heading"><div><h3>Document verification</h3><p>{application.documents.filter(item => item.status === 'Verified').length} of {application.documents.length} documents verified</p></div>{verified ? <span className="complete-label"><CheckCircle2 size={15} /> All verified</span> : <span className="pending-label"><Clock3 size={15} /> Review required</span>}</div><div className="document-rows review-document-rows">{application.documents.map(document => <div className="document-row review-document" key={document.name}><span className={`document-file-icon ${document.status === 'Missing' ? 'document-missing' : ''}`}><FileText size={18} /></span><div className="document-info"><strong>{document.name}</strong><small>{document.fileName ?? 'No file uploaded'}</small></div><StatusBadge status={document.status} />{document.status === 'Missing' ? <span className="missing-label">Missing</span> : document.status !== 'Verified' && <><button className="mini-action mini-verify" onClick={() => onVerify(document.name)}><Check size={14} /> Verify</button><button className="mini-action mini-reject" onClick={() => onRejectDocument(document.name)}><X size={14} /> Replace</button></>}</div>)}</div></section>
      {showDeficiency && <form className="panel deficiency-form" onSubmit={event => { event.preventDefault(); onDeficiency({ reason, message, deadline, ...(documentName ? { documentName } : {}) }); setShowDeficiency(false); setMessage('') }}><div className="panel-heading"><div><h3>Request a correction</h3><p>The student will be notified immediately.</p></div><button className="icon-button" type="button" onClick={() => setShowDeficiency(false)} aria-label="Close"><X size={18} /></button></div><div className="deficiency-fields"><div className="deficiency-meta"><div><label htmlFor="deficiency-reason">Reason</label><select id="deficiency-reason" className="input" value={reason} onChange={event => setReason(event.target.value)}><option>Missing document</option><option>Invalid document</option><option>Incorrect information</option><option>Document expired</option></select></div><div><label htmlFor="deficiency-document">Document to update</label><select id="deficiency-document" className="input" value={documentName} onChange={event => setDocumentName(event.target.value)}>{application.documents.map(document => <option value={document.name} key={document.name}>{document.name}</option>)}</select></div><div><label htmlFor="deficiency-deadline">Deadline</label><input id="deficiency-deadline" className="input" type="date" min={new Date().toISOString().slice(0, 10)} value={deadline} required onChange={event => setDeadline(event.target.value)} /></div></div><div><label htmlFor="deficiency-message">Student message</label><textarea id="deficiency-message" className="input textarea" required minLength={8} value={message} onChange={event => setMessage(event.target.value)} placeholder="Explain what the student needs to do..." /></div><button className="button button-warning" type="submit"><Bell size={15} /> Send deficiency</button></div></form>}
      <section className="panel review-section"><div className="panel-heading"><div><h3>Application timeline</h3><p>Milestones and review progress</p></div></div><div className="timeline">{timeline.map(([label, date, complete], index) => <div className={`timeline-item ${complete ? 'timeline-complete' : ''}`} key={label}><span className="timeline-marker">{complete ? <Check size={12} /> : index + 1}</span><div><strong>{label}</strong><small>{complete ? formatDate(date) : 'Awaiting review'}</small></div></div>)}</div></section>
    </div><aside className="review-aside"><div className="approval-card panel"><span className={`approval-card-icon ${approveReady ? 'approval-ready' : ''}`}>{approveReady ? <ShieldCheck size={21} /> : <Clock3 size={21} />}</span><h3>{decisionMade ? 'Decision recorded' : 'Decision checklist'}</h3><DecisionCheck title="Eligibility" value={application.eligibilityResult ? 'PASS' : 'FAIL'} pass={application.eligibilityResult} /><DecisionCheck title="Documents" value={verified ? 'COMPLETE' : `${application.documents.filter(item => item.status === 'Verified').length}/${application.documents.length} verified`} pass={verified} /><DecisionCheck title="Verification" value={verified ? 'COMPLETE' : 'IN PROGRESS'} pass={verified} />{decisionMade && <DecisionCheck title="Final decision" value={application.status.toUpperCase()} pass={application.status === 'Approved'} />}<div className={`approval-callout ${approveReady ? 'callout-ready' : ''}`}>{decisionMade ? 'This application already has a final decision.' : approveReady ? 'All checks are complete. This application is ready for a decision.' : 'Approval becomes available once all documents are verified and eligibility passes.'}</div><button disabled={!approveReady || decisionMade} className="button button-primary button-full" onClick={() => onDecision('Approved')}><CheckCircle2 size={16} /> Approve application</button><button disabled={decisionMade} className="button button-danger-outline button-full" onClick={() => onDecision('Rejected')}><XCircle size={16} /> Reject application</button><button disabled={decisionMade} className="button button-secondary button-full" onClick={() => setShowDeficiency(!showDeficiency)}><Bell size={16} /> Raise deficiency</button></div><div className="review-help"><CircleHelp size={17} /><p>Need more information? Raise a deficiency to request corrections before making a final decision.</p></div></aside></div>
  </div>
}

function ReviewField({ label, value }: { label: string; value: string }) { return <div className="review-field"><small>{label}</small><strong>{value || 'Not provided'}</strong></div> }
function DecisionCheck({ title, value, pass }: { title: string; value: string; pass: boolean }) { return <div className="decision-check"><span>{pass ? <CheckCircle2 size={17} /> : <Clock3 size={17} />}{title}</span><strong className={pass ? 'check-pass' : 'check-pending'}>{value}</strong></div> }

function AdminDashboard({ applications, scholarships, onReview, onNavigate }: { applications: Application[]; scholarships: Scholarship[]; onReview: (id: string) => void; onNavigate: (page: Page) => void }) {
  const pending = applications.filter(item => ['Submitted', 'Under Review', 'Resubmitted'].includes(item.status)).length
  const eligible = applications.filter(item => item.eligibilityResult).length
  const deficiency = applications.filter(item => item.status === 'Deficiency').length
  const approved = applications.filter(item => item.status === 'Approved').length
  const rejected = applications.filter(item => item.status === 'Rejected').length
  const statuses = [{ name: 'Under review', value: applications.filter(item => ['Submitted', 'Under Review', 'Resubmitted'].includes(item.status)).length, color: '#4f64d8' }, { name: 'Deficiency', value: deficiency, color: '#e5a33b' }, { name: 'Approved', value: approved, color: '#3ea77b' }, { name: 'Rejected', value: rejected, color: '#df7474' }]
  const schemes = scholarships.map(scheme => ({ name: scheme.name.length > 18 ? `${scheme.name.slice(0, 17)}…` : scheme.name, applications: applications.filter(item => item.scholarshipId === scheme.id).length }))
  const monthly = monthlyApplications(applications)
  return <div className="dashboard-stack admin-dashboard"><div className="admin-stats-grid"><StatCard label="Total applications" value={String(applications.length)} detail="All scholarship schemes" icon={<BriefcaseBusiness />} color="blue" /><StatCard label="Pending verification" value={String(pending)} detail="Awaiting your review" icon={<Clock3 />} color="amber" /><StatCard label="Eligible" value={String(eligible)} detail="Meet scheme criteria" icon={<CheckCircle2 />} color="green" /><StatCard label="Deficiency" value={String(deficiency)} detail="Student action required" icon={<Activity />} color="rose" /><StatCard label="Approved" value={String(approved)} detail="Ready to move forward" icon={<Award />} color="purple" /><StatCard label="Rejected" value={String(rejected)} detail="Not approved" icon={<XCircle />} color="slate" /></div>
    <div className="analytics-grid"><section className="panel chart-panel"><div className="panel-heading"><div><h3>Applications by status</h3><p>Current application outcomes</p></div><span className="chart-period">All time <ChevronDown size={14} /></span></div><div className="chart-body"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statuses} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={56} outerRadius={83} paddingAngle={4} stroke="none">{statuses.map(item => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip /><text x="50%" y="47%" textAnchor="middle" className="chart-center-number">{applications.length}</text><text x="50%" y="56%" textAnchor="middle" className="chart-center-label">applications</text></PieChart></ResponsiveContainer></div><div className="chart-legend">{statuses.map(item => <div key={item.name}><i style={{ background: item.color }} />{item.name}<strong>{item.value}</strong></div>)}</div></section>
      <section className="panel chart-panel"><div className="panel-heading"><div><h3>Applications by scholarship</h3><p>Distribution across active schemes</p></div></div><div className="chart-body chart-bar-body"><ResponsiveContainer width="100%" height="100%"><BarChart data={schemes} margin={{ top: 14, right: 8, bottom: 2, left: -18 }}><CartesianGrid stroke="#edf0f5" vertical={false} /><XAxis dataKey="name" tick={{ fill: '#8b91a4', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: '#8b91a4', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip cursor={{ fill: '#f4f5fb' }} /><Bar dataKey="applications" fill="#6879e6" radius={[5, 5, 0, 0]} barSize={32} /></BarChart></ResponsiveContainer></div></section>
      <section className="panel chart-panel chart-monthly"><div className="panel-heading"><div><h3>Monthly applications</h3><p>Application activity over time</p></div><span className="trend-note"><ArrowRight size={14} /> Applications</span></div><div className="chart-body chart-area-body"><ResponsiveContainer width="100%" height="100%"><AreaChart data={monthly} margin={{ top: 12, right: 12, bottom: 0, left: -20 }}><defs><linearGradient id="applicationGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6879e6" stopOpacity={0.19} /><stop offset="100%" stopColor="#6879e6" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid stroke="#edf0f5" vertical={false} /><XAxis dataKey="month" tick={{ fill: '#8b91a4', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: '#8b91a4', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip /><Area type="monotone" dataKey="applications" stroke="#6274df" strokeWidth={2.5} fill="url(#applicationGradient)" /></AreaChart></ResponsiveContainer></div></section>
    </div>
    <section className="panel applications-panel"><div className="panel-heading"><div><h3>Recent applications</h3><p>New and updated applications to review</p></div><button className="text-link" onClick={() => onNavigate('applications')}>View all applications <ArrowRight size={14} /></button></div><div className="recent-list admin-recent">{[...applications].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, 4).map(item => <button className="recent-item" key={item.applicationId} onClick={() => onReview(item.applicationId)}><span className="avatar avatar-small">{initials(item.studentName)}</span><span className="recent-description"><strong>{item.studentName}</strong><small>{item.applicationId} · {item.scholarshipName}</small></span><span className={`eligibility-label ${item.eligibilityResult ? 'eligibility-yes' : 'eligibility-no'}`}><span />{item.eligibilityResult ? 'Eligible' : 'Not eligible'}</span><StatusBadge status={item.status} /><ChevronRight className="recent-chevron" size={16} /></button>)}</div></section>
  </div>
}

function SchemeManagement({ scholarships, onSave, onToggle, editingId, onEdit }: { scholarships: Scholarship[]; onSave: (scheme: Scholarship) => void; onToggle: (id: string) => void; editingId: string | null; onEdit: (id: string | null) => void }) {
  const [draft, setDraft] = useState<Scholarship | null>(null)
  useEffect(() => {
    if (editingId === 'new') setDraft({ id: `scheme-${Date.now()}`, name: '', description: '', benefits: '', deadline: '', minCgpa: 7, maxIncome: 300000, category: 'ST', educationLevel: 'Undergraduate', requiredDocuments: ['Caste/Tribe Certificate', 'Income Certificate', 'Marks Memo', 'Bonafide Certificate', 'Bank Passbook'], active: true })
    else if (editingId) { const selected = scholarships.find(item => item.id === editingId); setDraft(selected ? { ...selected, requiredDocuments: [...selected.requiredDocuments] } : null) }
    else setDraft(null)
  }, [editingId, scholarships])
  const update = <K extends keyof Scholarship,>(key: K, value: Scholarship[K]) => setDraft(current => current ? { ...current, [key]: value } : current)
  const documentOptions = ['Caste/Tribe Certificate', 'Income Certificate', 'Marks Memo', 'Bonafide Certificate', 'Bank Passbook']
  return <div className="scheme-management">{draft && <form className="panel scheme-edit-panel" onSubmit={event => { event.preventDefault(); onSave(draft) }}><div className="panel-heading"><div><h3>{editingId === 'new' ? 'Add scholarship' : 'Edit scholarship'}</h3><p>Set the scheme details and configurable eligibility rules.</p></div><button className="icon-button" type="button" aria-label="Close editor" onClick={() => onEdit(null)}><X size={18} /></button></div><div className="scheme-form-grid"><FormInput label="Scholarship name" value={draft.name} onChange={event => update('name', event.target.value)} required /><FormInput label="Application deadline" type="date" value={draft.deadline} onChange={event => update('deadline', event.target.value)} required /><div className="scheme-form-wide"><label htmlFor="scheme-description">Description</label><textarea id="scheme-description" className="input textarea" value={draft.description} required onChange={event => update('description', event.target.value)} /></div><div className="scheme-form-wide"><label htmlFor="scheme-benefits">Benefits</label><textarea id="scheme-benefits" className="input textarea" value={draft.benefits} required onChange={event => update('benefits', event.target.value)} /></div><FormInput label="Minimum CGPA" type="number" step="0.1" min="0" max="10" value={draft.minCgpa} onChange={event => update('minCgpa', Number(event.target.value))} required /><FormInput label="Maximum family income (₹)" type="number" min="0" value={draft.maxIncome} onChange={event => update('maxIncome', Number(event.target.value))} required /><div><label htmlFor="scheme-category">Required category</label><select id="scheme-category" className="input" value={draft.category} onChange={event => update('category', event.target.value)}><option>ST</option><option>SC</option><option>OBC</option><option>General</option><option>Any</option></select></div><div><label htmlFor="scheme-level">Education level</label><select id="scheme-level" className="input" value={draft.educationLevel} onChange={event => update('educationLevel', event.target.value)}><option>Undergraduate</option><option>Postgraduate</option><option>Doctoral</option><option>Any</option></select></div><fieldset className="scheme-form-wide document-checks"><legend>Required documents</legend>{documentOptions.map(name => <label key={name}><input type="checkbox" checked={draft.requiredDocuments.includes(name)} onChange={event => update('requiredDocuments', event.target.checked ? [...draft.requiredDocuments, name] : draft.requiredDocuments.filter(item => item !== name))} />{name}</label>)}</fieldset></div><div className="form-actions"><button type="button" className="button button-secondary" onClick={() => onEdit(null)}>Cancel</button><button className="button button-primary" disabled={!draft.requiredDocuments.length}><Check size={15} /> Save scholarship</button></div></form>}
    <div className="scheme-admin-grid">{scholarships.map(scheme => <article className="panel scheme-admin-card" key={scheme.id}><div className="scheme-admin-top"><span className={`scheme-icon scheme-icon-${scholarships.indexOf(scheme) % 3}`}><Award size={19} /></span><StatusBadge status={scheme.active ? 'Active' : 'Inactive'} /></div><h3>{scheme.name}</h3><p>{scheme.description}</p><div className="scheme-admin-rules"><span>CGPA <strong>≥ {scheme.minCgpa}</strong></span><span>Income <strong>≤ {money(scheme.maxIncome)}</strong></span><span>Category <strong>{scheme.category}</strong></span><span>Level <strong>{scheme.educationLevel}</strong></span></div><div className="scheme-admin-bottom"><span>Deadline · {formatDate(scheme.deadline)}</span><div><button className="button button-secondary" onClick={() => onEdit(scheme.id)}>Edit</button><button className={`button ${scheme.active ? 'button-danger-outline' : 'button-primary'}`} onClick={() => onToggle(scheme.id)}>{scheme.active ? 'Deactivate' : 'Activate'}</button></div></div></article>)}</div>
  </div>
}

function ReportsPage({ applications }: { applications: Application[] }) {
  const data = monthlyApplications(applications)
  const statuses = ['Submitted', 'Under Review', 'Deficiency', 'Resubmitted', 'Approved', 'Rejected']
  return <div className="reports-page"><div className="admin-stats-grid"><StatCard label="Total applications" value={String(applications.length)} detail="All programmes" icon={<BriefcaseBusiness />} color="blue" /><StatCard label="Eligible applicants" value={String(applications.filter(item => item.eligibilityResult).length)} detail="Passed all current rules" icon={<CheckCircle2 />} color="green" /><StatCard label="Approved" value={String(applications.filter(item => item.status === 'Approved').length)} detail="Final approvals" icon={<Award />} color="purple" /><StatCard label="Action needed" value={String(applications.filter(item => item.status === 'Deficiency').length)} detail="Student follow-up" icon={<Activity />} color="rose" /></div><section className="panel report-chart-panel"><div className="panel-heading"><div><h3>Application activity</h3><p>Monthly submissions in this reporting period</p></div><span className="chart-period">Last 6 months <ChevronDown size={14} /></span></div><div className="report-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data}><CartesianGrid stroke="#edf0f5" vertical={false} /><XAxis dataKey="month" tick={{ fill: '#8b91a4', fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: '#8b91a4', fontSize: 12 }} axisLine={false} tickLine={false} /><Tooltip /><Area type="monotone" dataKey="applications" stroke="#6274df" fill="#6879e622" strokeWidth={2.5} /></AreaChart></ResponsiveContainer></div></section><section className="panel report-status-panel"><div className="panel-heading"><div><h3>Application status breakdown</h3><p>Current workflow distribution</p></div></div>{statuses.map(status => { const count = applications.filter(item => item.status === status).length; return <div className="report-status-row" key={status}><StatusBadge status={status} /><div className="report-bar"><span style={{ width: `${applications.length ? count / applications.length * 100 : 0}%` }} /></div><strong>{count}</strong></div> })}</section></div>
}

export default App
