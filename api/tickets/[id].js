module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const id = req.query.id;
  if (req.method === 'GET') return res.json({ id, subject: 'Test Ticket', description: 'Test description', status: 'Open', messages: [], author: { name: 'Author One', email: 'author1@bookleaf.com' }, book: null });
  if (req.method === 'PATCH') return res.json({ id, ...req.body });
  return res.status(405).json({error:'Method not allowed'});
};
