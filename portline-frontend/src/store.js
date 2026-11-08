export const activeShipment = {
  get: () => localStorage.getItem('activeShipment') || '',
  set: (id) => (id ? localStorage.setItem('activeShipment', String(id)) : localStorage.removeItem('activeShipment')),
};
