## Elderly Immunization Recommendations

decision "Elderly Based":

- **when** "Client Age Greater Than 60" then recommend activity "Indicate".
- **when** "Client Age Less Than 60" then:
  - recommend activity ["Vaccinate"](#vaccinate).
  - recommend activity ["another thing"](#indicate).
  - recommend activity ["something else"](#do-another-thing).
- **end when**
- **when** "Client Age Greater Than 60" then:
  - **when** "Most Recent BMI" then:
    - use decision "Some Other Decision";
    - use decision "Some Other Other Decision".
  - **end when**
- **end when**

## Vaccinate

activity "Vaccinate" request CPGImmunization.

## Indicate

activity "Indicate" request CPGProposeDiagnosis with "Colonoscopy".

## Do Another thing

activity "another thing" request CPGCommunication with `Do the thing` because `it's the right thing to do`.
