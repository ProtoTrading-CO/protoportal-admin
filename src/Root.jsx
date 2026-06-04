import AdminPage from './pages/AdminPage';

const temporaryCustomer = {
  id: 'temporary-admin-access',
  role: 'admin',
  name: 'Temporary Admin Access',
  email: 'temporary@local',
};

export default function Root() {
  return (
    <AdminPage
      customer={temporaryCustomer}
      onLogout={() => { window.location.reload(); }}
      onViewPortal={() => { window.location.href = 'https://protoportal-main.vercel.app'; }}
    />
  );
}
