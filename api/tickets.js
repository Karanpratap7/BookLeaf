module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.json([]);
  if (req.method === 'POST') return res.status(201).json({ id: '1', subject: req.body?.subject || 'Test Ticket', description: req.body?.description || '', status: 'Open', category: 'General Inquiry', priority: 'Medium', messages: [{id:'1', senderRole:'AUTHOR', body:req.body?.description||'', createdAt:new Date().toISOString()}] });
  return res.status(405).json({error:'Method not allowed'});
};
