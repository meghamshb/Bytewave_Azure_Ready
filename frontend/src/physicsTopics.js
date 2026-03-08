export const PHYSICS_TOPICS = [
  { id: 'motion',      name: 'Motion & Kinematics',     description: 'Position, velocity, acceleration, graphs and 2D motion' },
  { id: 'forces',      name: 'Forces & Newton\'s Laws',  description: 'Forces and motion basics' },
  { id: 'energy',      name: 'Work, Energy & Power',    description: 'Energy forms and conservation' },
  { id: 'waves',       name: 'Waves & Sound',           description: 'Transverse waves, longitudinal waves, frequency and sound' },
  { id: 'light',       name: 'Light & Radiation',       description: 'Optics and electromagnetic waves' },
  { id: 'electricity', name: 'Electricity & Circuits',  description: 'Charges, fields, circuits' },
  { id: 'magnetism',   name: 'Magnetism',               description: 'Magnets and electromagnetic induction' },
  { id: 'heat',        name: 'Heat & Thermodynamics',   description: 'Temperature and heat transfer' },
  { id: 'gravity',     name: 'Gravity & Orbits',        description: 'Gravitational force and orbits' },
  { id: 'quantum',     name: 'Atoms & Nuclei',          description: 'Atomic structure, nuclear decay and energy levels' },
]

export function getTopicById(id) {
  return PHYSICS_TOPICS.find((t) => t.id === id) || null
}
