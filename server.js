require('dotenv').config();

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

let recipes = [];

app.post('/api/tiktok/auto-extract', async (req, res) => {
  try {
    const { tiktokUrl, userId } = req.body;
    console.log('Starting auto-extract for:', tiktokUrl);

    const tiktokData = await fetchTikTokData(tiktokUrl);
    
    if (!tiktokData.success) {
      return res.status(400).json({
        success: false,
        error: 'Could not fetch TikTok video data'
      });
    }

    console.log('TikTok data fetched!');

    const recipe = await extractRecipeFromCaption(
      tiktokData.caption,
      tiktokData.thumbnailUrl,
      tiktokUrl
    );

    recipe.id = Date.now().toString();
    recipe.userId = userId;
    recipe.createdAt = new Date();
    recipes.push(recipe);

    console.log('Recipe saved!');

    res.json({
      success: true,
      recipe: recipe,
      message: 'Recipe extracted and saved!'
    });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/recipes/:userId', (req, res) => {
  const userRecipes = recipes.filter(r => r.userId === req.params.userId);
  res.json({ success: true, recipes: userRecipes });
});

app.post('/api/test-claude', async (req, res) => {
  try {
    const { caption } = req.body;
    
    const recipe = await extractRecipeFromCaption(
      caption,
      'https://example.com/image.jpg',
      'https://tiktok.com/test'
    );
    
    res.json({
      success: true,
      recipe: recipe
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Recipe API running!' });
});

async function fetchTikTokData(url) {
  try {
    const embedUrl = 'https://www.tiktok.com/oembed?url=' + encodeURIComponent(url);
    
    const response = await axios.get(embedUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RecipeBot/1.0)'
      }
    });

    return {
      success: true,
      caption: response.data.title || '',
      thumbnailUrl: response.data.thumbnail_url,
      authorName: response.data.author_name
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function extractRecipeFromCaption(caption, thumbnailUrl, sourceUrl) {
  const promptText = 'Extract a recipe from this TikTok caption. Return ONLY valid JSON:\n\n{\n  "title": "Recipe name",\n  "description": "Brief description",\n  "prepTime": "X min",\n  "cookTime": "X min",\n  "totalTime": "X min",\n  "servings": "X",\n  "difficulty": "Easy/Medium/Hard",\n  "ingredients": ["ingredient 1", "ingredient 2"],\n  "instructions": ["Step 1", "Step 2"],\n  "tags": ["tag1", "tag2"],\n  "notes": "Tips"\n}\n\nTikTok Caption:\n' + caption;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: promptText }]
  });

  let text = message.content[0].text;
  if (text.includes('```json')) {
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  }
  
  const recipe = JSON.parse(text.trim());
  recipe.sourceUrl = sourceUrl;
  recipe.thumbnailUrl = thumbnailUrl;
  
  return recipe;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Recipe API running on port ' + PORT);
  console.log('Ready to extract recipes!');
});
