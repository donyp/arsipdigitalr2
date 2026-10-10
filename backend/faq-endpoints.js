// FAQ Knowledge Base Endpoints
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  {
    realtime: { mode: 'manual' }
  }
);

// Get all FAQ categories
router.get('/faq/categories', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('faq_categories')
      .select('*')
      .order('order_number', { ascending: true });
    
    if (error) throw error;
    
    res.json({ categories: data || [] });
    
  } catch (err) {
    console.error('Get FAQ categories error:', err);
    res.status(500).json({ error: 'Failed to get categories' });
  }
});

// Get all FAQ articles
router.get('/faq/articles', async (req, res) => {
  try {
    const { category_id, search } = req.query;
    
    let query = supabase
      .from('faq_articles')
      .select(`
        *,
        faq_categories (
          id,
          name,
          icon
        )
      `)
      .order('order_number', { ascending: true });
    
    // Filter by category
    if (category_id) {
      query = query.eq('category_id', category_id);
    }
    
    // Search
    if (search) {
      query = query.or(`question.ilike.%${search}%,answer.ilike.%${search}%`);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    res.json({ articles: data || [] });
    
  } catch (err) {
    console.error('Get FAQ articles error:', err);
    res.status(500).json({ error: 'Failed to get articles' });
  }
});

// Get single FAQ article
router.get('/faq/articles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Increment view count
    await supabase.rpc('increment_faq_views', { article_id: id });
    
    const { data, error } = await supabase
      .from('faq_articles')
      .select(`
        *,
        faq_categories (
          id,
          name,
          icon
        )
      `)
      .eq('id', id)
      .single();
    
    if (error) throw error;
    
    res.json({ article: data });
    
  } catch (err) {
    console.error('Get FAQ article error:', err);
    res.status(500).json({ error: 'Failed to get article' });
  }
});

// Mark FAQ article as helpful/not helpful
router.post('/faq/articles/:id/feedback', async (req, res) => {
  try {
    const { id } = req.params;
    const { helpful } = req.body; // true or false
    
    const field = helpful ? 'helpful_count' : 'not_helpful_count';
    
    const { error } = await supabase.rpc('increment_faq_feedback', { 
      article_id: id, 
      is_helpful: helpful 
    });
    
    if (error) throw error;
    
    res.json({ success: true });
    
  } catch (err) {
    console.error('FAQ feedback error:', err);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

// Full-text search FAQ
router.get('/faq/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 3) {
      return res.status(400).json({ error: 'Search query must be at least 3 characters' });
    }
    
    const { data, error } = await supabase
      .from('faq_articles')
      .select(`
        *,
        faq_categories (
          id,
          name,
          icon
        )
      `)
      .textSearch('question', q, { 
        type: 'websearch',
        config: 'indonesian'
      })
      .limit(20);
    
    if (error) throw error;
    
    res.json({ articles: data || [] });
    
  } catch (err) {
    console.error('FAQ search error:', err);
    res.status(500).json({ error: 'Failed to search' });
  }
});

// Get popular FAQ articles (most viewed)
router.get('/faq/popular', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const { data, error } = await supabase
      .from('faq_articles')
      .select(`
        *,
        faq_categories (
          id,
          name,
          icon
        )
      `)
      .order('views', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    
    res.json({ articles: data || [] });
    
  } catch (err) {
    console.error('Get popular FAQ error:', err);
    res.status(500).json({ error: 'Failed to get popular articles' });
  }
});

// Get helpful FAQ articles (highest helpful_count)
router.get('/faq/helpful', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const { data, error } = await supabase
      .from('faq_articles')
      .select(`
        *,
        faq_categories (
          id,
          name,
          icon
        )
      `)
      .order('helpful_count', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    
    res.json({ articles: data || [] });
    
  } catch (err) {
    console.error('Get helpful FAQ error:', err);
    res.status(500).json({ error: 'Failed to get helpful articles' });
  }
});

// Admin: Create FAQ category
router.post('/faq/categories', async (req, res) => {
  try {
    const { name, description, icon, order_number } = req.body;
    
    const { data, error } = await supabase
      .from('faq_categories')
      .insert({
        name,
        description,
        icon,
        order_number: order_number || 0
      })
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ category: data });
    
  } catch (err) {
    console.error('Create FAQ category error:', err);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Admin: Create FAQ article
router.post('/faq/articles', async (req, res) => {
  try {
    const { 
      category_id, 
      question, 
      answer, 
      tags, 
      order_number,
      created_by
    } = req.body;
    
    const { data, error } = await supabase
      .from('faq_articles')
      .insert({
        category_id,
        question,
        answer,
        tags: tags || [],
        order_number: order_number || 0,
        created_by
      })
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ article: data });
    
  } catch (err) {
    console.error('Create FAQ article error:', err);
    res.status(500).json({ error: 'Failed to create article' });
  }
});

// Admin: Update FAQ article
router.put('/faq/articles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      category_id, 
      question, 
      answer, 
      tags, 
      order_number,
      updated_by
    } = req.body;
    
    const { data, error } = await supabase
      .from('faq_articles')
      .update({
        category_id,
        question,
        answer,
        tags,
        order_number,
        updated_by,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ article: data });
    
  } catch (err) {
    console.error('Update FAQ article error:', err);
    res.status(500).json({ error: 'Failed to update article' });
  }
});

// Admin: Delete FAQ article
router.delete('/faq/articles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from('faq_articles')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    res.json({ success: true });
    
  } catch (err) {
    console.error('Delete FAQ article error:', err);
    res.status(500).json({ error: 'Failed to delete article' });
  }
});

// Create stored procedures for atomic updates
const createStoredProcedures = async () => {
  try {
    // Increment views
    await supabase.rpc('create_function', {
      sql: `
        CREATE OR REPLACE FUNCTION increment_faq_views(article_id UUID)
        RETURNS void AS $$
        BEGIN
          UPDATE faq_articles SET views = views + 1 WHERE id = article_id;
        END;
        $$ LANGUAGE plpgsql;
      `
    });
    
    // Increment feedback
    await supabase.rpc('create_function', {
      sql: `
        CREATE OR REPLACE FUNCTION increment_faq_feedback(article_id UUID, is_helpful BOOLEAN)
        RETURNS void AS $$
        BEGIN
          IF is_helpful THEN
            UPDATE faq_articles SET helpful_count = helpful_count + 1 WHERE id = article_id;
          ELSE
            UPDATE faq_articles SET not_helpful_count = not_helpful_count + 1 WHERE id = article_id;
          END IF;
        END;
        $$ LANGUAGE plpgsql;
      `
    });
    
    console.log('FAQ stored procedures created');
  } catch (err) {
    console.error('Failed to create stored procedures:', err);
  }
};

// Initialize
createStoredProcedures();

module.exports = router;
