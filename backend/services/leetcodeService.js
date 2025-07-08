// services/leetcodeService.js - LeetCode data scraping
const axios = require('axios');
const cheerio = require('cheerio');

class LeetCodeService {
  constructor() {
    this.baseURL = 'https://leetcode.com';
    this.graphqlURL = 'https://leetcode.com/graphql';
  }

  async getUserProfile(username) {
    try {
      // Method 1: Try GraphQL API (may be rate limited)
      const graphqlQuery = {
        query: `
          query getUserProfile($username: String!) {
            allQuestionsCount {
              difficulty
              count
            }
            matchedUser(username: $username) {
              username
              submitStats {
                acSubmissionNum {
                  difficulty
                  count
                }
                totalSubmissionNum {
                  difficulty
                  count
                }
              }
              profile {
                ranking
                userAvatar
                realName
                reputation
              }
            }
          }
        `,
        variables: { username }
      };

      const response = await axios.post(this.graphqlURL, graphqlQuery, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });

      if (response.data && response.data.data && response.data.data.matchedUser) {
        return this.parseGraphQLResponse(response.data.data);
      }

      // Fallback to web scraping if GraphQL fails
      return await this.scrapeUserProfile(username);

    } catch (error) {
      console.error(`Error fetching profile for ${username}:`, error.message);
      throw new Error(`Failed to fetch LeetCode profile for ${username}`);
    }
  }

  parseGraphQLResponse(data) {
    const user = data.matchedUser;
    const stats = user.submitStats;
    
    let totalSolved = 0;
    let totalSubmissions = 0;
    
    stats.acSubmissionNum.forEach(item => {
      totalSolved += item.count;
    });
    
    stats.totalSubmissionNum.forEach(item => {
      totalSubmissions += item.count;
    });

    const successRate = totalSubmissions > 0 ? (totalSolved / totalSubmissions * 100) : 0;

    return {
      username: user.username,
      totalSolved,
      successRate: Math.round(successRate * 100) / 100,
      ranking: user.profile.ranking,
      avatar: user.profile.userAvatar,
      reputation: user.profile.reputation,
      easySolved: stats.acSubmissionNum.find(s => s.difficulty === 'Easy')?.count || 0,
      mediumSolved: stats.acSubmissionNum.find(s => s.difficulty === 'Medium')?.count || 0,
      hardSolved: stats.acSubmissionNum.find(s => s.difficulty === 'Hard')?.count || 0
    };
  }

  async scrapeUserProfile(username) {
    try {
      const url = `${this.baseURL}/${username}/`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      
      // Extract data from the page
      const scriptTags = $('script').toArray();
      let userData = null;

      for (let script of scriptTags) {
        const content = $(script).html();
        if (content && content.includes('userProfileCalendar')) {
          // Try to extract JSON data from script tags
          const matches = content.match(/userProfileCalendar.*?(\{.*?\})/s);
          if (matches) {
            try {
              userData = JSON.parse(matches[1]);
              break;
            } catch (e) {
              continue;
            }
          }
        }
      }

      // Fallback: extract from visible elements
      if (!userData) {
        const solvedText = $('.text-label-1').text();
        const solvedMatch = solvedText.match(/(\d+)/);
        const totalSolved = solvedMatch ? parseInt(solvedMatch[1]) : 0;

        return {
          username,
          totalSolved,
          successRate: 0, // Will need to calculate separately
          ranking: null,
          avatar: null,
          reputation: 0,
          easySolved: 0,
          mediumSolved: 0,
          hardSolved: 0
        };
      }

      return userData;

    } catch (error) {
      console.error(`Error scraping profile for ${username}:`, error.message);
      throw new Error(`Failed to scrape LeetCode profile for ${username}`);
    }
  }

  async getUserContestRanking(username) {
    try {
      const query = {
        query: `
          query userContestRankingInfo($username: String!) {
            userContestRanking(username: $username) {
              attendedContestsCount
              rating
              globalRanking
              totalParticipants
              topPercentage
            }
          }
        `,
        variables: { username }
      };

      const response = await axios.post(this.graphqlURL, query, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      return response.data.data.userContestRanking;
    } catch (error) {
      console.error(`Error fetching contest ranking for ${username}:`, error.message);
      return null;
    }
  }

  async validateUsername(username) {
    try {
      const profile = await this.getUserProfile(username);
      return profile.username === username;
    } catch (error) {
      return false;
    }
  }
}

module.exports = new LeetCodeService();