import { Construct } from 'constructs';
import iam = require('aws-cdk-lib/aws-iam');
import kms = require('aws-cdk-lib/aws-kms');
import { DefaultTagHandler } from '../tags/default-tag-handler';

export interface CMKProps {
    //Initial alias to add to the key
    readonly keyAlias: string;

    //A description of the key.
    readonly keyDescription: string;

    //A list of IAM Principals to be granted access for KMS Key
    readonly principals?: iam.IPrincipal[];

    //A list of actions to be granted on the KMS key
    // https://docs.aws.amazon.com/kms/latest/APIReference/API_Operations.html
    readonly actions: string[];
}

/**
 * CMK construct creates CMK construct with opinionated practices enforced.
 * This enforces keyRotation by default to true, not enabling key rotation could be a security risk
 */
export class CustomerManagedKey extends Construct {
    public readonly encryptionKey: kms.Key;

    constructor(scope: Construct, id: string, props: CMKProps) {
        super(scope, id);
        DefaultTagHandler.applyTags(this);

        this.encryptionKey = new kms.Key(this, props.keyAlias, {
            alias: props.keyAlias,
            description: props.keyDescription,
            enableKeyRotation: true,
        });

        /**
         * Grant root account permissions to perform actions on CMK
         * In AWS KMS, you must attach resource-based policies to your customer master keys (CMKs). In a key policy,
         * you use "*" for the resource, which effectively means "this CMK." A key policy applies only to the CMK it is
         * attached to. See: https://docs.aws.amazon.com/kms/latest/developerguide/control-access-overview.html
         */
        this.encryptionKey.addToResourcePolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                principals: [new iam.AccountRootPrincipal()],
                actions: props.actions,
                resources: ['*'],
            }),
        );

        // grant permissions to additional roles/principals provided in the props
        if (props.principals !== undefined) {
            props.principals.forEach((role) => {
                this.encryptionKey.grant(role, ...props.actions);
            });
        }
    }
}