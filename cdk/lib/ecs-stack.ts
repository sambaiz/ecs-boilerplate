import * as cdk from '@aws-cdk/core'
import * as iam from '@aws-cdk/aws-iam'
import * as ecs from '@aws-cdk/aws-ecs'
import * as ecsPatterns from '@aws-cdk/aws-ecs-patterns'
import * as ec2 from '@aws-cdk/aws-ec2'
import * as route53 from '@aws-cdk/aws-route53'
import * as certificatemanager from '@aws-cdk/aws-certificatemanager'

export interface Props extends cdk.StackProps {
  vpcAttributes?: ec2.VpcAttributes,
  route53?: {
    zoneId: string
    zoneName: string
    recordName: string
  },
  acmArn?: string,
  containerPort?: number,
  cpu?: number,
  memoryLimitMiB?: number,
  minCapacity?: number,
  maxCapacity?: number
  scaleCPUPercent?: number
}

export class ECSStack extends cdk.Stack {
  props: Props
  constructor(scope: cdk.Construct, id: string, props: Props) {
    super(scope, id, props);
    this.props = props
    const vpc = props.vpcAttributes ? ec2.Vpc.fromVpcAttributes(this, 'VPC', props.vpcAttributes) : undefined;
    this.createECSService(vpc)
  }

  createECSService(vpc?: ec2.IVpc) {
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc
    })
    const executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
      ]
    })
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    })
    const hostedZone = this.props.route53 ? route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: this.props.route53?.zoneId,
      zoneName: this.props.route53?.zoneName
    }) : undefined;
    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'Service', {
      cluster,
      cpu: (this.props.cpu || 256),
      memoryLimitMiB: (this.props.memoryLimitMiB || 512),
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset('../app'),
        executionRole,
        taskRole,
        containerPort: (this.props.containerPort || 8080),
        environment: {
          "PORT": "" + (this.props.containerPort || 8080),
        },
      },
      assignPublicIp: true,
      certificate: this.props.acmArn ? certificatemanager.Certificate.fromCertificateArn(this, 'Certificate', this.props.acmArn) : undefined,
      domainZone: hostedZone,
      domainName: this.props.route53 ? `${this.props.route53?.recordName}.${this.props.route53?.zoneName}.` : undefined,
    })
    service.service.autoScaleTaskCount({
      minCapacity: this.props.minCapacity || 1,
      maxCapacity: this.props.maxCapacity || 5,
    }).scaleOnCpuUtilization('ScaleTaskOnCPU', {
      targetUtilizationPercent: this.props.scaleCPUPercent || 80,
    })
    return service
  }
}
