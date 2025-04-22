# Known Good Results

// Instance: IMMZD2DTMeaslesDose0
// Description: If the child or patient has not been given MCV0 between 6 and 9 months
// Provenance: WHO recommendations for routine immunization - summary tables (March 2023)
decision "IMMZ.D2.DT.Measles MCV Dose 0":
    when "Measles Routine Immunization Schedule Incomplete" then:
        when "No MCV0 Doses Administered" then:
            when "Client Age Less Than 6 Months" then do "Client Age Less Than 6 Months".
            when "Last Live Vaccine Administered Within 4 Weeks" then do "Last Live Vaccine Administered Within 4 Weeks".
            when "Client Is Due For MCV0" then do "Provide Measles Vaccine".
        done
        when "MCV0 Dose Administered" then do "MCV0 Dose Administered".
    done
done

// Instance: IMMZD2DTMeaslesLT
// Description: If the child or patient has not been given MCV1 (at 12 months) and MCV2 (between 15-18 months) vaccination
// Provenance: WHO recommendations for routine immunization - summary tables (March 2023)
decision "IMMZ.D2.DT.Measles Low Transmission":
    when "Measles Routine Immunization Schedule Incomplete" then:
        when "No Primary Series Doses Administered" then:
            when "Client Age Less Than 12 Months" then do "Client Age Less Than 12 Months".
            when "Last Live Vaccine Administered Within 4 Weeks" then do "Last Live Vaccine Administered Within 4 Weeks_2".
            when "Client Is Due For MCV1" then do "Provide Measles Vaccine".
        done
        when "One Primary Series Dose Administered" then:
            when "Client Age Less Than 15 Months" then do "Client Age Less Than 15 Months".
            when "Last Live Vaccine Administered Within 4 Weeks" then do "Last Live Vaccine Administered Within 4 Weeks_3".
            when "Client Is Due For MCV2" then do "Provide Measles Vaccine".
        done
        when "Two Primary Series Doses Administered" then do "Measles primary series is complete.".
    done
done

// Instance: IMMZD2DTMeaslesOT
// Description: If the child or patient has not been given MCV1 (at 9 months) and MCV2 (between 15-18 months) vaccination
// Provenance: WHO recommendations for routine immunization - summary tables (March 2023)
decision "IMMZ.D2.DT.Measles Ongoing Transmission":
    when "Measles Routine Immunization Schedule Incomplete" then:
        when "No Primary Series Doses Administered" then:
            when "Client Age Less Than 9 Months" then do "Client Age Less Than 9 Months".
            when "Last Live Vaccine Administered Within 4 Weeks" then do "Last Live Vaccine Administered Within 4 Weeks_2".
            when "Client Is Due For MCV1" then do "Provide Measles Vaccine".
        done
        when "One Primary Series Dose Administered" then:
            when "Client Age Less Than 15 Months" then do "Client Age Less Than 15 Months".
            when "Last Live Vaccine Administered Within 4 Weeks" then do "Last Live Vaccine Administered Within 4 Weeks_3".
            when "Client Is Due For MCV2" then do "Provide Measles Vaccine".
        done
        when "Two Primary Series Doses Administered" then do "Measles primary series is complete".
    done
done

// Instance: IMMZD2DTMeaslesSupplementary
// Description: If the child or patient has not been given a supplementary dose
// Provenance: WHO recommendations for routine immunization - summary tables (March 2023)
decision "IMMZ.D2.DT.Measles Supplementary:
    when "Measles Routine Immunization Schedule Complete" then:
        when "No Supplementary Dose Administered" then:
            when "Last Live Vaccine Administered Within 4 Weeks" then do "Last Live Vaccine Administered Within 4 Weeks_4".
            when "Client Is Due For Supplementary Dose" then do "Provide Measles Vaccine".
        done
        when "Supplementary Dose Administered" then do "Supplementary Dose Administered".
    done
done

// Instance: IMMZD5DTMeaslesCI
// Description: Check contraindications for Measles vaccine
// Provenance: WHO recommendations for routine immunization - summary tables (March 2023)
decision "IMMZ.D5.DT.Measles.Contraindication":
    when "MCV Dose Contraindicated" then do "Check Contraindication for Measles Immunization".
    when "Contraindication Evaluation of the MCV dose" then do "Evaluate Contraindication for Measles".
done

// Instance: IMMZDTImmunizationStrategy
// Description: Provide vaccinations according to the recommended schedule
// Provenance: WHO recommendations for routine immunization - summary tables (March 2023)
decision "IMMZ.DT.Immunization Strategy":
    // Check Immunizations
    when "" then:
        // Measles Dose 0
        // Measles Routine Immunization
        // Measles Supplementary Dose
        // Measles Contraindications
        when "" then:
            use "IMMZ.D2.DT.Measles MCV Dose 0"".
            use "IMMZ.D2.DT.Measles Ongoing Transmission".
            use "IMMZ.D2.DT.Measles MCV Dose 0".
            use "IIMMZ.D5.DT.Measles.Contraindication".
        done
    done
done

activity "Client Age Less Than 6 Months"
    perform CPGCommunicationRequest
    of `Should not vaccinate client for MCV0 as client is less than 6 months. Check for any vaccines due, and inform the caregiver of when to come back for MCV0.`.

activity "Last Live Vaccine Administered Within 4 Weeks"
    perform CPGCommunicationRequest
    of `Should not vaccinate client for MCV0 as live vaccine was administered in the last 4 weeks. Check for any vaccines due, and inform the caregiver of when to come back for MCV0.`.

activity "Provide Measles Vaccine" 
    perform CPGMedicationRequest of "Measles vaccines".

activity "MCV0 Dose Administered"
    perform CPGCommunicationRequest of `MCV0 was administered. Check measles routine immunization schedule.`.

activity "Client Age Less Than 12 Months"
    perform CPGCommunicationRequest
    of `Should not vaccinate client as client's age is less than 12 months. Check for any vaccines due, and inform the caregiver of when to come back for MCV1.`.

activity "Last Live Vaccine Administered Within 4 Weeks_2"
    perform CPGCommunicationRequest
    of `Should not vaccinate client for MCV1 as live vaccine was administered in the last 4 weeks. Check for any vaccines due and inform the caregiver of when to come back for MCV1.`.

activity "Client Age Less Than 15 Months"
    perform CPGCommunicationRequest
    of `Should not vaccinate client for MCV2 as client's age is less than 15 months. Check for any vaccines due, and inform the caregiver of when to come back for MCV2.`.

activity "Last Live Vaccine Administered Within 4 Weeks_3"
    perform CPGCommunicationRequest
    of `Should not vaccinate client for MCV2 as live vaccine was administered in the last 4 weeks. Check for any vaccines due, and inform the caregiver of when to come back for MCV2.`.

activity "Measles primary series is complete."
    perform CPGCommunicationRequest
    of `Measles primary series is complete. Two measles primary series doses were administered. Check if a measles supplementary dose is appropriate for the client.`
    because `An additional dose of MCV should be administered to HIV-infected children receiving HAART following immune reconstitution. If CD4+ T lymphocyte counts are monitored, an additional dose of MCV should be administered when immune reconstitution has been achieved, e.g. when the CD4+ T lymphocyte count reaches 20–25%. Where CD4+ T lymphocyte monitoring is not available, children should receive an additional dose of MCV 6–12 months after initiation of HAART.`.

activity "Client Age Less Than 9 Months"
    perform CPGCommunicationRequest
    of `Should not vaccinate client as client's age is less than 9 months. Check for any vaccines due, and inform the caregiver of when to come back for MCV1.`.

activity "Measles primary series is complete"
    perform CPGCommunicationRequest
    of `Measles primary series is complete. Two measles primary series doses were administered. Check if a measles supplementary dose is appropriate for the client.`
    because `An additional dose of MCV should be administered to HIV-infected children receiving HAART following immune reconstitution. If CD4+ T lymphocyte counts are monitored, an additional dose of MCV should be administered when immune reconstitution has been achieved, e.g. when the CD4+ T lymphocyte count reaches 20–25%. Where CD4+ T lymphocyte monitoring is not available, children should receive an additional dose of MCV 6–12 months after initiation of HAART.`.

activity "Last Live Vaccine Administered Within 4 Weeks_4"
    perform CPGCommunicationRequest
    of `Should not vaccinate client for measles supplementary dose as live vaccine was administered in the last 4 weeks. Check for any vaccines due, and inform the caregiver of when to come back for supplementary dose.`.

activity "Supplementary Dose Administered"
    perform CPGCommunicationRequest
    of `Measles immunization schedule is complete. Measles supplementary dose was administered.`.

activity "Check Contraindication for Measles Immunization" 
    perform CPGMedicationRequest of "Measles vaccines"
    because `While vaccines are universally recommended, some clients may have contraindications to particular vaccines.<br/>Additional contraindications may be included in WHO position papers for the vaccine - Measles vaccines: WHO position paper (April 2017).`.

activity "Evaluate Contraindication for Measles" 
    perform CPGServiceRequest of "Measles Code"
    because `While vaccines are universally recommended, some clients may have contraindications to particular vaccines.<br/>Additional contraindications may be included in WHO position papers for the vaccine - Measles vaccines: WHO position paper (April 2017).`.
