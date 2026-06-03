import AdminPage from './pages/AdminPage';

const temporaryCustomer = {
  id: 'temporary-admin-access',
  role: 'admin',
  name: 'Temporary Admin Access',
  email: 'temporary@local',
};

export default function Root() {
  return (
    <div>
      <div style={styles.noticeBar}>
        Login is temporarily disabled. The admin dashboard is currently open without sign-in.
      </div>
      <AdminPage
        customer={temporaryCustomer}
        onLogout={() => {
          window.location.reload();
        }}
        onViewPortal={() => {
          window.location.href = 'https://protoportal-main.vercel.app';
        }}
      />
    </div>
  );
}

const styles = {
  noticeBar: {
    background: '#c40000',
    color: '#fff',
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    fontWeight: '600',
    textAlign: 'center',
    padding: '10px 16px',
    position: 'sticky',
    top: 0,
    zIndex: 1000,
  },
};
