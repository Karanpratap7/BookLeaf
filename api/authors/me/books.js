const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const prisma = new PrismaClient();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const auth = req.headers.authorization;
    let decoded;
    if (auth && auth.startsWith('Bearer ')) {
      decoded = jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET || 'secret');
    }
    if (!decoded) return res.status(401).json({ error: 'Unauthorized' });

    if (req.path === '/api/authors/me/books' && req.method === 'GET') {
      return res.json(await prisma.book.findMany({ where: { authorId: decoded.id } }));
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    await prisma.$disconnect();
  }
};