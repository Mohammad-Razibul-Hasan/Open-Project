//-- copyright
// OpenProject is an open source project management software.
// Copyright (C) the OpenProject GmbH
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License version 3.
//
// OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
// Copyright (C) 2006-2013 Jean-Philippe Lang
// Copyright (C) 2010-2013 the ChiliProject Team
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
// See COPYRIGHT and LICENSE files for more details.
//++

import { WorkPackageResource } from 'core-app/features/hal/resources/work-package-resource';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, Input, inject } from '@angular/core';
import { I18nService } from 'core-app/core/i18n/i18n.service';
import { HalEventsService } from 'core-app/features/hal/services/hal-events.service';
import { WorkPackageNotificationService } from 'core-app/features/work-packages/services/notifications/work-package-notification.service';
import { RelationResource } from 'core-app/features/hal/resources/relation-resource';
import { WorkPackageRelationsService } from '../wp-relations.service';

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'wp-relations-create',
  templateUrl: './wp-relation-create.template.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkPackageRelationsCreateComponent {
  readonly I18n = inject(I18nService);
  protected wpRelations = inject(WorkPackageRelationsService);
  protected notificationService = inject(WorkPackageNotificationService);
  protected halEvents = inject(HalEventsService);
  protected cdRef = inject(ChangeDetectorRef);

  private readonly destroyRef = inject(DestroyRef);
  private formRevision = 0;

  @Input() readonly workPackage:WorkPackageResource;

  public showRelationsCreateForm = false;

  public selectedRelationType:string = RelationResource.DEFAULT();

  public selectedWpId:string;

  public relationTypes = RelationResource.LOCALIZED_RELATION_TYPES(false);

  public isDisabled = false;

  public text = {
    abort: this.I18n.t('js.relation_buttons.abort'),
    relationType: this.I18n.t('js.relation_buttons.relation_type'),
    addNewRelation: this.I18n.t('js.relation_buttons.add_new_relation'),
  };

  public onSelected(workPackage?:WorkPackageResource) {
    if (workPackage) {
      this.selectedWpId = workPackage.id!;
      void this.createCommonRelation();
    }
  }

  protected createCommonRelation() {
    const { workPackage, selectedRelationType, selectedWpId, formRevision } = this;
    return this.wpRelations.addCommonRelation(workPackage.id!, selectedRelationType, selectedWpId)
      .then((relation) => {
        this.halEvents.push(workPackage, {
          eventType: 'association',
          relatedWorkPackage: relation.id!,
          relationType: selectedRelationType,
        });
        this.notificationService.showSave(workPackage);
        this.wpRelations.updateCounter(workPackage);
      })
      .catch((err:unknown) => this.notificationService.handleRawError(err, workPackage))
      .finally(() => {
        if (!this.destroyRef.destroyed && this.formRevision === formRevision && this.workPackage.id === workPackage.id) {
          this.toggleRelationsCreateForm();
        }
      });
  }

  public toggleRelationsCreateForm() {
    this.formRevision += 1;
    this.showRelationsCreateForm = !this.showRelationsCreateForm;
    // Reset value
    this.selectedWpId = '';
    this.cdRef.markForCheck();
  }
}
