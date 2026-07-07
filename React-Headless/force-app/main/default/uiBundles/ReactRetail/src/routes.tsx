import type { RouteObject } from 'react-router';
import HomeLayout from './home/HomeLayout';
import HomePage from './home/HomePage';
import ClientLayout from './personas/customer/ClientLayout';
import Customer360Page from './personas/customer/Customer360Page';
import NotFound from './pages/NotFound';

export const routes: RouteObject[] = [

  // CLIENT app — embedded Customer 360 (no in-app chrome; SF shell wraps it).
  {
    path: '/client',
    element: <ClientLayout />,
    children: [{ path: ':id', element: <Customer360Page /> }],
  },

  // HOME app — banker landing that replaces the standard home page (full shell).
  {
    path: '/',
    element: <HomeLayout />,
    children: [
      { index: true, element: <HomePage />, handle: { showInNavigation: true, label: 'Home' } },
      { path: '*', element: <NotFound /> },
    ],
  },
];
