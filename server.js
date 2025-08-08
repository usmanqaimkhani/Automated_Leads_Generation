const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Improved email regex
function extractEmails(text) {
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
    const matches = text.match(emailRegex) || [];
    return [...new Set(matches)]; // Remove duplicates
}

// Improved phone regex
function extractPhones(text) {
    const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
    const matches = text.match(phoneRegex) || [];
    return [...new Set(matches)]; // Remove duplicates
}

// Enhanced social media detection
function extractSocialLinks(html, url) {
    const socialPlatforms = {
        twitter: {
            regex: /(https?:\/\/)?(www\.)?twitter\.com\/[a-zA-Z0-9_\-\.]+\/?/g,
            base: 'https://twitter.com/'
        },
        facebook: {
            regex: /(https?:\/\/)?(www\.)?facebook\.com\/[a-zA-Z0-9_\-\.]+\/?/g,
            base: 'https://facebook.com/'
        },
        linkedin: {
            regex: /(https?:\/\/)?(www\.)?linkedin\.com\/[a-zA-Z0-9_\-\.]+\/?/g,
            base: 'https://linkedin.com/'
        },
        instagram: {
            regex: /(https?:\/\/)?(www\.)?instagram\.com\/[a-zA-Z0-9_\-\.]+\/?/g,
            base: 'https://instagram.com/'
        }
    };

    const socialLinks = {};

    for (const [platform, {regex, base}] of Object.entries(socialPlatforms)) {
        const matches = html.match(regex);
        if (matches && matches.length > 0) {
            // Take the first match and ensure it has proper URL format
            let link = matches[0];
            if (!link.startsWith('http')) {
                link = base + link.split('/').pop();
            }
            socialLinks[platform] = link;
        }
    }

    return socialLinks;
}

// Robust URL scraping function
async function scrapeUrl(url) {
    try {
        // Validate URL format
        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }

        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000,
            maxRedirects: 5
        });

        const $ = cheerio.load(response.data);
        const text = $('body').text();
        const html = response.data;

        // Extract information
        const emails = extractEmails(text);
        const phones = extractPhones(text);
        const socialLinks = extractSocialLinks(html, url);
        const domain = new URL(url).hostname.replace('www.', '');

        return {
            website: url,
            emails: emails.length > 0 ? emails : ['Not found'],
            phones: phones.length > 0 ? phones : ['Not found'],
            social: Object.keys(socialLinks).length > 0 ? socialLinks : {'Not found': ''},
            domain: domain,
            status: 'success'
        };
    } catch (error) {
        return {
            website: url,
            error: error.message,
            status: 'failed'
        };
    }
}

// API endpoint with better error handling
app.post('/api/scrape', async (req, res) => {
    try {
        const { urls } = req.body;

        // Validate input
        if (!urls || !Array.isArray(urls) || urls.length === 0) {
            return res.status(400).json({ 
                error: 'Invalid request: URLs array is required and must contain at least one URL' 
            });
        }

        // Process URLs with concurrency control
        const MAX_CONCURRENT = 3; // Process 3 URLs at a time
        const results = [];
        
        for (let i = 0; i < urls.length; i += MAX_CONCURRENT) {
            const batch = urls.slice(i, i + MAX_CONCURRENT);
            const batchResults = await Promise.all(
                batch.map(url => scrapeUrl(url).catch(error => ({
                    website: url,
                    error: error.message,
                    status: 'failed'
                })))
            );
            results.push(...batchResults);
        }

        res.json(results);
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`API endpoint: http://localhost:${PORT}/api/scrape`);
});