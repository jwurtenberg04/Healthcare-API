//Variable declarations

const API_KEY = "YOUR API KEY HERE";
const BASE_URL = "https://assessment.ksensetech.com/api/patients";

//Fetch the individual page with retry mechanism and backoff strategy to handle intermitten failures and rate limiting
async function fetchPage(page = 1, limit = 5, retries = 3, backoff = 2000) {
    const headers = { "x-api-key": API_KEY };
    const url = `${BASE_URL}?page=${page}&limit=${limit}`;

    for(let attempt = 0; attempt < retries; attempt++) {
        try {
            //attempt the fetch request
            const response = await fetch(url, { headers });
      
            if (response.ok) {
                return await response.json();
            } else if ([429, 500, 503].includes(response.status)) { 
                
                //if the response status is 429, 500, or 503, we retry with exponential backoff and log the attempt and the backoff time
                console.warn(`Attempt #${attempt}: ${response.status}, retrying in ${backoff / 2000}s...`);
                await new Promise(res => setTimeout(res, backoff)); //wait for backoff duration
                backoff *= 2;
                continue;
            }

         } catch (err) {
            //log the error connecting to the endpoint and retry with exponential backoff
            console.warn(`Endpoint error attempt #${attempt}: ${err.message}`);
            await new Promise(res => setTimeout(res, backoff));
            backoff *= 2;
        }
        
        
    }
    //if we reach here, it means we exhausted retries for this attempt
    console.error("Maximum retries reached. Unable to fetch data.");
    return null;
}

async function fetchAllData(limit = 20) {
    let allData = [];
    let page = 1;
    let moreData = true;
    while (true) {
        //loop through all pages and retrieve the data
        const data = await fetchPage(page, limit);
    
        if (data && data.data && data.data.length > 0) {
            allData = allData.concat(data.data);
            page++;
        }
        if(!data || !data.pagination?.hasNext) break; //if there's no more data, exit the loop
    }
    return allData;
}   


async function handleData(){
    const data = await fetchAllData();
    var highRisk = [];
    var feverRisk = [];
    var dataIssue = [];

    for(const patient of data){
        let points = 0;
        let systolic = 0;
        let diastolic = 0;
        //decalre all variables and validate data
        const id = patient.patient_id;
        if(id == null || id == "") dataIssue.push(id);
        const name = patient.name;
        if (name == null || name == "" || !(typeof name === 'string')) dataIssue.push(id);
        const age = patient.age;
        if(age == null || age == "" || isNaN(age)) dataIssue.push(id);
        const gender = patient.gender;
        if(gender == null || gender == "" || (gender !== "M" && gender !== "F")) dataIssue.push(id); 
        if (patient.blood_pressure && typeof patient.blood_pressure === "string") {
            [systolic, diastolic] = patient.blood_pressure.split("/").map(Number);
        } else {
            dataIssue.push(id);
        }
        const temp = patient.temperature;
        if(temp == null || temp == 0 || isNaN(temp)) dataIssue.push(id);
        const visitDate = patient.visit_date;
        if(visitDate == null || visitDate == "" || isNaN(Date.parse(visitDate))) dataIssue.push(id);
        const diagnosis = patient.diagnosis;
        if(diagnosis == null || diagnosis == "" || !(typeof diagnosis === 'string')) dataIssue.push(id);
        const medications = patient.medications;
        for(const med of medications){
            if(med == null || med == "" || !(typeof med === 'string')) dataIssue.push(id);
            break;
        }

        //calculate risk points
        if (!age || isNaN(age)) {
            // do nothing
        } else if (age > 65) {
            points += 2;
        } else if (age >= 40) {
            points += 1;
        }

        if (!systolic || !diastolic || isNaN(systolic) || isNaN(diastolic)) {
            // do nothing
        } else if (systolic >= 140 || diastolic >= 90) {
            points += 3;
        } else if ((systolic >= 130 && systolic <= 139) || (diastolic >= 80 && diastolic <= 89)) {
            points += 2;
        } else if ((systolic >= 120 && systolic <= 129) && diastolic < 80) {
            points += 1;
        }

        if (!temp || isNaN(temp)) {
            // do nothing
        } else if (temp >= 101) {
            points += 2;
            feverRisk.push(id);
        } else if (temp >= 99.6) {
            points += 1;
            feverRisk.push(id);
        }
        if(points >= 4){
            highRisk.push(id);
        }
    }
    return {highRisk, feverRisk, dataIssue};
   
}


async function submit(results) {
    try {
        const response = await fetch('https://assessment.ksensetech.com/api/submit-assessment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY
            },
            body: JSON.stringify(results)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Assessment Results Submitted:', data);
        return data;
    } catch (err) {
        console.error('Failed to submit assessment:', err);
    }
}

(async () => {
    //GET the data and process it
    const results = await handleData();

    //Transform results into the required structure
    const res = {
        high_risk_patients: results.highRisk,
        fever_patients: results.feverRisk,
        data_quality_issues: results.dataIssue
    };

    //submit the final results using  POST request
    await submit(res);
})();