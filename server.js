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
    console.log('Starting TikTok auto-extract for:', tiktokUrl);

    const tiktokData = await fetchTikTokData(tiktokUrl);
    
    if (!tiktokData.success) {
      return res.status(400).json({
        success: false,
        error: 'Could not fetch TikTok video data'
      });
    }

    const recipe = await extractRecipeSimple(
      tiktokData.caption,
      tiktokData.thumbnailUrl,
      tiktokUrl
    );

    recipe.id = Date.now().toString();
    recipe.userId = userId;
    recipe.createdAt = new Date();
    recipe.source = 'TikTok';
    recipes.push(recipe);

    res.json({
      success: true,
      recipe: recipe,
      message: 'Recipe extracted from TikTok!'
    });

  } catch (error) {
    console.error('TikTok Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/instagram/auto-extract', async (req, res) => {
  try {
    const { instagramUrl, userId } = req.body;
    console.log('Starting Instagram auto-extract for:', instagramUrl);

    const instagramData = await fetchInstagramData(instagramUrl);
    
    if (!instagramData.success) {
      return res.status(400).json({
        success: false,
        error: 'Could not fetch Instagram post data'
      });
    }

    const recipe = await extractRecipeSimple(
      instagramData.caption,
      instagramData.thumbnailUrl,
      instagramUrl
    );

    recipe.id = Date.now().toString();
    recipe.userId = userId;
    recipe.createdAt = new Date();
    recipe.source = 'Instagram';
    recipes.push(recipe);

    res.json({
      success: true,
      recipe: recipe,
      message: 'Recipe extracted from Instagram!'
    });

  } catch (error) {
    console.error('Instagram Error:', error.message);
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

async function fetchInstagramData(url) {
  try {
    const embedUrl = 'https://api.instagram.com/oembed?url=' + encodeURIComponent(url);
    
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

async function extractRecipeSimple(caption, thumbnailUrl, sourceUrl) {
  console.log('Extracting recipe from caption...');
  
  const prompt = 'Read this social media post and extract the recipe information. Just copy what you see - do not make anything up.\n\nYour response must be ONLY a JSON object with this structure:\n{\n  "title": "the recipe name from the post",\n  "description": "a one-sentence description if available, or empty string",\n  "ingredients": ["ingredient 1", "ingredient 2", "etc - exactly as written in post"],\n  "instructions": ["step 1", "step 2", "etc - exactly as written in post"],\n  "prepTime": "prep time if mentioned, or empty string",\n  "cookTime": "cook time if mentioned, or empty string",\n  "servings": "servings if mentioned, or empty string"\n}\n\nIMPORTANT:\n- Copy ingredients and instructions EXACTLY as they appear\n- If something is not in the post, use empty string or empty array\n- Output ONLY the JSON object, no explanations\n- Do not add markdown formatting\n\nPost:\n' + caption;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ 
        role: 'user', 
        content: prompt 
      }]
    });

    let text = message.content[0].text.trim();
    
    // Remove any markdown formatting
    text = text.replace(/```json/g, '');
    text = text.replace(/```/g, '');
    text = text.trim();
    
    // Find the JSON object
    const startIndex = text.indexOf('{');
    const endIndex = text.lastIndexOf('}') + 1;
    
    if (startIndex === -1 || endIndex === 0) {
      throw new Error('No JSON found in response');
    }
    
    text = text.substring(startIndex, endIndex);
    
    console.log('Parsing:', text.substring(0, 100) + '...');
    
    const recipe = JSON.parse(text);
    
    // Add metadata
    recipe.sourceUrl = sourceUrl;
    recipe.thumbnailUrl = thumbnailUrl;
    recipe.difficulty = '';
    recipe.totalTime = '';
    recipe.tags = [];
    recipe.notes = '';
    
    return recipe;
    
  } catch (error) {
    console.error('Extraction failed:', error.message);
    throw new Error('Could not extract recipe - please make sure the post contains a recipe with ingredients and instructions');
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Recipe API running on port ' + PORT);
  console.log('Simple recipe extraction ready!');
});
