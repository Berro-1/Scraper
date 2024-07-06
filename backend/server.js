const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('https://www.linkedin.com/login');

  // Login
  await page.type('#username', ''); //please use your credentials :p
  await page.type('#password', ''); //please use your credentials :p
  await page.click('button[type="submit"]');
  await page.waitForNavigation();
 
  
  await page.goto('https://www.linkedin.com/jobs');
  await page.waitForSelector('.jobs-search-box__input', { timeout: 60000 });

  const jobTitle = 'Software Engineer';

  await page.click('input.jobs-search-box__text-input.jobs-search-global-typeahead__input');
  await page.type('input.jobs-search-box__text-input.jobs-search-global-typeahead__input', jobTitle);
  await page.keyboard.press('Enter');
  await page.waitForNavigation();

  // Custom delay function
  const delay = (time) => new Promise(resolve => setTimeout(resolve, time));

  // Function to extract job details
  const extractJobDetails = async (page) => {
    return await page.evaluate(() => {
      const job = {};
      try {
        const titleElement = document.querySelector('h1.t-24.t-bold.inline');
        job.title = titleElement ? titleElement.innerText : 'No Title Found';

        const companyElement = document.querySelector('div.job-details-jobs-unified-top-card__company-name a');
        job.company = companyElement ? companyElement.innerText : 'No Company Found';

        const primaryDescriptionContainer = document.querySelector('.job-details-jobs-unified-top-card__primary-description-container .t-black--light');
        const spans = primaryDescriptionContainer ? primaryDescriptionContainer.querySelectorAll('span.tvm__text--low-emphasis') : [];

        let location = 'No Location Found';
        let postingDate = 'No Posting Date Found';
        let applicants = 'No Applicants Info Found';

        spans.forEach(span => {
          const text = span.innerText.trim();
          if (text.match(/\d+ (day|week|month|year)s? ago/)) {
            postingDate = text;
          } else if (text.match(/(applicant|applicants|Over \d+ applicants)/)) {
            applicants = text;
          } else if (location === 'No Location Found') {
            location = text;
          }
        });

        job.location = location;
        job.postingDate = postingDate;
        job.applicants = applicants;

        const descriptionElement = document.querySelector('div.jobs-box__html-content.jobs-description-content__text');
        job.description = descriptionElement ? descriptionElement.innerText.replace(/\n/g, ' ').trim() : 'No Description Found';

        const applyButton = document.querySelector('.jobs-apply-button--top-card a');
        job.applyLink = 'No Apply Link Found';

        const skillsElements = document.querySelectorAll('.job-details-how-you-match__skills-item-wrapper');
        job.skillsMissing = [];
        job.skillsPresent = [];

        skillsElements.forEach(element => {
          const title = element.querySelector('h3.t-14.t-bold').innerText;
          const skills = element.querySelector('.job-details-how-you-match__skills-item-subtitle').innerText.split(',').map(skill => skill.trim());
          if (title.includes('skills missing')) {
            job.skillsMissing = skills;
          } else if (title.includes('skills on your profile')) {
            job.skillsPresent = skills;
          }
        });

      } catch (error) {
        console.error('Error extracting job details:', error);
      }

      return job;
    });
  };

  await page.setRequestInterception(true);
  page.on('request', request => {
    if (['image', 'stylesheet', 'font'].includes(request.resourceType())) {
      request.abort();
    } else {
      request.continue();
    }
  });

  const jobDetailsArray = [];
  let totalPages;

  try {
    await page.waitForSelector('.artdeco-pagination__pages', { timeout: 60000 });
    totalPages = await page.$$eval('.artdeco-pagination__pages li', pages => pages.length);
  } catch (error) {
    console.error('Error getting pagination details:', error);
    totalPages = 1;
  }

  for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
    console.log(`Scraping page ${currentPage} of ${totalPages}`);

    if (currentPage > 1) {
      await page.click(`li[data-test-pagination-page-btn="${currentPage}"] button`);
      await page.waitForNavigation();
    }

    const resultsSelector = '.display-flex.t-normal.t-12.t-black--light.jobs-search-results-list__text span';
    await page.waitForSelector(resultsSelector, { timeout: 60000 });

    let jobCards = await page.$$('.job-card-container');
    let previousHeight;
    while (true) {
      previousHeight = await page.evaluate('document.querySelector(".jobs-search-results-list").scrollHeight');
      await page.evaluate('window.scrollTo(0, document.querySelector(".jobs-search-results-list").scrollHeight)');
      await delay(2000); 
      const newHeight = await page.evaluate('document.querySelector(".jobs-search-results-list").scrollHeight');
      if (newHeight === previousHeight) break;
    }

    jobCards = await page.$$('.job-card-container');

    for (let i = 0; i < jobCards.length; i++) {
      try {
        const jobCard = jobCards[i];
        await jobCard.click();
        await page.waitForSelector('h1.t-24.t-bold.inline', { timeout: 80000 });

        await delay(3000);

        const jobDetails = await extractJobDetails(page);
        jobDetails.url = await page.url(); 
        console.log(`Job ${i + 1} on page ${currentPage} Details:`, jobDetails);

        jobDetailsArray.push(jobDetails);

        await delay(1000);
      } catch (error) {
        console.error(`An error occurred for job index ${i} on page ${currentPage}:`, error);
      }
    }
  }

  await browser.close();

  // Save job details to a JSON file
  fs.writeFileSync('jobDetails.json', JSON.stringify(jobDetailsArray, null, 2));
})();
