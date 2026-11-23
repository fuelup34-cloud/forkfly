import { navigate } from './router.jsx';

// Jump to a section of the home page (e.g. "restaurants"), from any page.
export function goToSection(id) {
  const scroll = () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (location.pathname === '/') scroll();
  else {
    navigate('/');
    requestAnimationFrame(() => requestAnimationFrame(scroll));
  }
}
