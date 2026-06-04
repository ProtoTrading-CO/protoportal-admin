import AdminPage from './pages/AdminPage';
import FulfillmentPage from './pages/FulfillmentPage';

const temporaryCustomer = {
  id: 'temporary-admin-access',
  role: 'admin',
  name: 'Temporary Admin Access',
  email: 'temporary@local',
};

export default function Root() {
  if (window.location.pathname === '/fulfillment') {
    return <FulfillmentPage />;
  }

  return (
    <AdminPage
      customer={temporaryCustomer}
      onLogout={() => { window.location.reload(); }}
      onViewPortal={() => { window.location.href = 'https://protoportal-main.vercel.app'; }}
    />
  );
}
