require('dotenv').config();

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

app.post('/api/image/extract', async (req, res) => {
  try {
    const { imageData, userId } = req.body;
    
    if (!imageData || !userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: imageData and userId' 
      });
    }

    console.log('Extracting recipe from image...');

    const base64Image = imageData.replace(/^data:image\/\w+;base64,/, '');

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: base64Image
            }
          },
          {
            type: 'text',
            text: 'Extract the recipe from this image. Return ONLY valid JSON in this exact format (no markdown, no explanation): {"title": "Recipe Name", "description": "Brief description", "prepTime": "15 min", "cookTime": "30 min", "servings": "4", "difficulty": "Easy", "ingredients": ["2 cups flour", "1 cup sugar"], "instructions": ["Step 1", "Step 2"], "notes": "Notes", "tags": ["dinner"]}. Extract all visible recipe information. If any field is not present, use an empty string or empty array.'
          }
        ]
      }]
    });

    let recipeText = message.content[0].text.trim();
    recipeText = recipeText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const extractedRecipe = JSON.parse(recipeText);

    const recipe = {
      id: Date.now().toString(),
      userId: userId,
      title: extractedRecipe.title || 'Scanned Recipe',
      description: extractedRecipe.description || '',
      prepTime: extractedRecipe.prepTime || '',
      cookTime: extractedRecipe.cookTime || '',
      servings: extractedRecipe.servings || '',
      difficulty: extractedRecipe.difficulty || '',
      ingredients: extractedRecipe.ingredients || [],
      instructions: extractedRecipe.instructions || [],
      notes: extractedRecipe.notes || '',
      tags: extractedRecipe.tags || [],
      source: 'Image Scan',
      sourceUrl: '',
      thumbnailUrl: imageData,
      createdAt: new Date(),
      favorite: false
    };

    recipes.push(recipe);
    console.log('Recipe extracted successfully:', recipe.title);

    res.json({ 
      success: true, 
      recipe: recipe
    });

  } catch (error) {
    console.error('Image extraction error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to extract recipe from image' 
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
  
  const prompt = 'Read this social media post and extract the recipe information. Just copy what you see - do not make anything up. Your response must be ONLY a JSON object with this structure: {"title": "the recipe name from the post", "description": "a one-sentence description if available, or empty string", "ingredients": ["ingredient 1", "ingredient 2"], "instructions": ["step 1", "step 2"], "prepTime": "prep time if mentioned, or empty string", "cookTime": "cook time if mentioned, or empty string", "servings": "servings if mentioned, or empty string"}. IMPORTANT: Copy ingredients and instructions EXACTLY as they appear. If something is not in the post, use empty string or empty array. Output ONLY the JSON object, no explanations. Do not add markdown formatting. Post: ' + caption;

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
    text = text.replace(/```json/g, '');
    text = text.replace(/```/g, '');
    text = text.trim();
    
    const startIndex = text.indexOf('{');
    const endIndex = text.lastIndexOf('}') + 1;
    
    if (startIndex === -1 || endIndex === 0) {
      throw new Error('No JSON found in response');
    }
    
    text = text.substring(startIndex, endIndex);
    const recipe = JSON.parse(text);
    
    recipe.sourceUrl = sourceUrl;
    recipe.thumbnailUrl = thumbnailUrl;
    recipe.difficulty = '';
    recipe.totalTime = '';
    recipe.tags = [];
    recipe.notes = '';
    
    return recipe;
    
  } catch (error) {
    console.error('Extraction failed:', error.message);
    throw new Error('Could not extract recipe');
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Recipe API running on port ' + PORT);
  console.log('Image scanning ready!');
});
