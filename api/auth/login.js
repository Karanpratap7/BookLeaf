module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  const { email, password } = req.body || {};
  if (email === 'admin@bookleaf.com' && password === 'Admin@123') {
    return res.json({ token: 'test-token', role: 'ADMIN', user: { id: '1', email, name: 'Admin User', role: 'ADMIN' }});
  }
  if (email === 'support@bookleaf.com' && password === 'Support@123') {
    return res.json({ token: 'test-token', role: 'SUPPORT', user: { id: '3', email, name: 'Support Admin', role: 'SUPPORT' }});
  }
  if (email && password === 'Author@123') {
    return res.json({ token: 'test-token', role: 'AUTHOR', user: { id: '2', email, name: email.split('@')[0], role: 'AUTHOR' }});
  }
  return res.status(401).json({ error: "Invalid credentials" });
};
