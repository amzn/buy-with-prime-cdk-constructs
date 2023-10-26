export const ADDRESS_DATA_IDENTIFIER = 'arn:aws:dataprotection::aws:data-identifier/Address';
export const AWS_SECRET_KEY_DATA_IDENTIFIER = 'arn:aws:dataprotection::aws:data-identifier/AwsSecretKey';
export const EMAIL_DATA_IDENTIFIER = 'arn:aws:dataprotection::aws:data-identifier/EmailAddress';
export const SSN_US_DATA_IDENTIFIER = 'arn:aws:dataprotection::aws:data-identifier/Ssn-US';
export const SSN_ES_DATA_IDENTIFIER = 'arn:aws:dataprotection::aws:data-identifier/Ssn-ES';
export const PHONE_NUM_US_DATA_IDENTIFIER = 'arn:aws:dataprotection::aws:data-identifier/PhoneNumber-US';
export const NAME_US_DATA_IDENTIFIER = 'arn:aws:dataprotection::aws:data-identifier/Name';
export const PUTTY_PRIVATE_KEY_DATA_IDENTIFIER = 'arn:aws:dataprotection::aws:data-identifier/PuttyPrivateKey';
export const DRIVERS_LICENSE_US_DATA_IDENTIFIER = 'arn:aws:dataprotection::aws:data-identifier/DriversLicense-US';
export const PASSPORT_NUMBER_DATA_IDENTIFIER = 'arn:aws:dataprotection::aws:data-identifier/PassportNumber-US';
export const ZIP_CODE_DATA_IDENTIFIER = 'arn:aws:dataprotection::aws:data-identifier/ZipCode-US';

/**
 * Maintains the list of default data protection policy to logs.
 * Refer to this doc for all fields :
 * https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/protect-sensitive-log-data-types.html
 */
export const DEFAULT_SENSITIVE_DATA_IDENTIFIERS: string[] = [
    ADDRESS_DATA_IDENTIFIER,
    EMAIL_DATA_IDENTIFIER,
    SSN_US_DATA_IDENTIFIER,
    SSN_ES_DATA_IDENTIFIER,
    PHONE_NUM_US_DATA_IDENTIFIER,
    AWS_SECRET_KEY_DATA_IDENTIFIER,
];